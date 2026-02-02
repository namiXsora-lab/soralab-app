// amplify/backend/function/billingApi/src/index.js

const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

const SUCCESS_URL =
  process.env.CHECKOUT_SUCCESS_URL ||
  "https://main.d3sy4qro8vglws.amplifyapp.com/success";

const CANCEL_URL =
  process.env.CHECKOUT_CANCEL_URL ||
  "https://main.d3sy4qro8vglws.amplifyapp.com/?status=cancel";

function getMethod(event) {
  return (
    event?.requestContext?.http?.method ||
    event?.requestContext?.httpMethod ||
    event?.httpMethod ||
    "GET"
  );
}

function getPath(event) {
  return event?.rawPath || event?.path || event?.resource || "/";
}

function getUserSub(event) {
  // 1) API Gateway + Cognito authorizer
  const claims =
    event?.requestContext?.authorizer?.claims ||
    event?.requestContext?.authorizer?.jwt?.claims;

  const subFromAuth = claims?.sub;
  if (subFromAuth) return subFromAuth;

  // 2) Function URL / query param
  return event?.queryStringParameters?.userSub || null;
}

exports.handler = async (event) => {
  console.log("EVENT:", JSON.stringify(event));
  console.log("HAS requestContext?", !!event.requestContext);
  console.log("PATH rawPath/path:", event.rawPath, event.path);
  console.log("METHOD guess:", getMethod(event));

  const headers = {
    "Access-Control-Allow-Origin": "https://main.d3sy4qro8vglws.amplifyapp.com",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };

  const method = getMethod(event);
  if (method === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const path = getPath(event);

    // ====== 追加：/subscription（会員判定） ======
    if (path.endsWith("/subscription")) {
      const userSub = getUserSub(event);
      if (!userSub) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ message: "Unauthorized (no userSub)" }),
        };
      }

      const tableName = process.env.SUBSCRIPTIONS_TABLE;
      if (!tableName) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ message: "Missing env SUBSCRIPTIONS_TABLE" }),
        };
      }

      const res = await ddb
        .get({
          TableName: tableName,
          Key: { userSub },
        })
        .promise();

      const item = res.Item || null;

      const isActive =
        item &&
        item.isPaid === true &&
        (item.status === "active" || item.stripeStatus === "active");

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          userSub,
          isSubscribed: isActive,   // ★ これを追加（または置き換え）
          isActive,                 // ←残してもOK
          subscription: item,
        }),
      };
    }

    // ====== 追加：/polevault/diagnose（棒高跳び診断：サーバで軽く計算） ======
    if (path.endsWith("/polevault/diagnose")) {
      if (method !== "POST") {
        return { statusCode: 405, headers, body: JSON.stringify({ message: "Method Not Allowed" }) };
      }

      // ★ ここに貼る
      let meta = {};
      try {
        meta = event?.body ? JSON.parse(event.body) : event;
      } catch {
        meta = {};
      }

      // 最低限のチェック（フロントの checkVideo 相当をサーバで）
      const chk = checkVideo(meta);
      if (chk.checkStatus === "error") {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            checkStatus: chk.checkStatus,
            message: chk.message,
          }),
        };
      }

      // ダミー診断（重い処理はここを本解析に置き換える）
      const diag = diagnoseDummy(meta);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          checkStatus: chk.checkStatus, // ok / warning
          message: chk.message,
          ...diag,
        }),
      };
    }

    // /checkout でも / でも許可（どちらかに寄せたいならここを調整）
    const okPath =
      path === "/" ||
      path.endsWith("/checkout") ||
      path.endsWith("/subscription") ||
      path.endsWith("/polevault/diagnose");
    // ====== 追加：/portal（Customer Portal URL 発行） ======
    if (path.endsWith("/portal")) {
      const userSub = getUserSub(event);
      if (!userSub) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ message: "Unauthorized (no userSub)" }),
        };
      }

      const tableName = process.env.SUBSCRIPTIONS_TABLE;
      const res = await ddb.get({ TableName: tableName, Key: { userSub } }).promise();
      const item = res.Item;

      const customerId = item?.stripeCustomerId;
      if (!customerId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: "No stripeCustomerId yet" }),
        };
      }

      const returnUrl =
        process.env.PORTAL_RETURN_URL ||
        "https://main.d3sy4qro8vglws.amplifyapp.com/";

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ url: portalSession.url }),
      };
    }

    if (!okPath) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: "Not Found" }) };
    }

    const userSub = getUserSub(event);
    if (!userSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: "Unauthorized (no userSub)" }),
      };
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: "Missing env STRIPE_PRICE_ID" }),
      };
    }

    // ====== 追加：二重課金防止（すでに契約中ならPortalへ） ======
    const tableName = process.env.SUBSCRIPTIONS_TABLE;
    if (!tableName) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: "Missing env SUBSCRIPTIONS_TABLE" }),
      };
    }

    const subRes = await ddb
      .get({
        TableName: tableName,
        Key: { userSub },
      })
      .promise();

    const current = subRes.Item || null;

    if (isStillActiveSubscription(current)) {
      // すでに契約中（または解約予約で期間内） → Checkoutを作らない
      const customerId = current?.stripeCustomerId;
      if (!customerId) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            message: "Already subscribed, but stripeCustomerId is missing in DB.",
            subscription: current,
          }),
        };
      }

      const returnUrl =
        process.env.PORTAL_RETURN_URL ||
        "https://main.d3sy4qro8vglws.amplifyapp.com/";

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          url: portalSession.url,
          alreadySubscribed: true,
        }),
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],

      success_url: `${SUCCESS_URL}?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: CANCEL_URL,

      client_reference_id: userSub,
      metadata: { userSub },
      subscription_data: { metadata: { userSub } },
    });


    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error("checkout error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Internal Server Error", detail: err?.message }),
    };
  }
};

function isStillActiveSubscription(item) {
  if (!item) return false;

  // Stripeの状態を優先（active / trialing）
  const stripeActive = item.stripeStatus === "active" || item.stripeStatus === "trialing";

  // アプリ側の状態（あなたの既存ロジックに合わせる）
  const appActive = item.isPaid === true && item.status === "active";

  // 「解約予約中（cancel_at_period_end）」でも、期間末までは有効扱いにしたい
  const nowUnix = Math.floor(Date.now() / 1000);
  const periodEndUnix = typeof item.currentPeriodEndUnix === "number" ? item.currentPeriodEndUnix : null;
  const stillInPaidPeriod = item.cancelAtPeriodEnd === true && periodEndUnix && periodEndUnix > nowUnix;

  return stripeActive || appActive || stillInPaidPeriod;
}

function checkVideo(meta) {
  const { duration, width, height, fps } = meta || {};

  if (!duration || duration < 2.0) {
    return {
      checkStatus: "error",
      message: "この動画では診断ができませんでした。\n助走〜反転まで映る動画で、もう一度お試しください。",
    };
  }
  if (!width || !height || Math.min(width, height) < 360) {
    return {
      checkStatus: "error",
      message: "この動画では診断ができませんでした。\n画質が低い可能性があります。もう一度お試しください。",
    };
  }
  if (fps && fps < 24) {
    return { checkStatus: "warning", message: "この動画は撮影条件の影響により、診断結果は「参考値」となります。" };
  }
  if (duration > 20) {
    return {
      checkStatus: "warning",
      message: "動画が長めのため、診断結果は「参考値」となります。\n（助走〜反転が短く収まる動画が安定します）",
    };
  }
  return { checkStatus: "ok", message: "動画を確認しました。フォーム診断を開始します。" };
}
