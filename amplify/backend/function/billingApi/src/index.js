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
  return event?.rawPath || event?.path || "/";
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

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

      const meta = JSON.parse(event.body || "{}");

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

function diagnoseDummy(meta) {
  const seed =
    (meta.duration || 0) * 1000 +
    (meta.fps || 0) * 10 +
    (meta.width || 0) +
    (meta.height || 0);

  const r = (k) => {
    const x = Math.sin(seed * (k + 1)) * 10000;
    return x - Math.floor(x);
  };

  const pick = (x) => {
    if (x < 0.25) return "bad";
    if (x < 0.60) return "ok";
    return "good";
  };

  const summary = {
    planting: pick(r(1)),
    takeoff: pick(r(2)),
    drive: pick(r(3)),
    inversion: pick(r(4)),
  };

  const order = ["drive", "planting", "takeoff", "inversion"];
  const titleMap = {
    planting: { good: "植え込みタイミング：適切", ok: "植え込みタイミング：やや早い", bad: "植え込みタイミング：早すぎ", advice: "助走リズムに合わせて植え込みを遅らせる意識" },
    takeoff: { good: "踏切×ポール角：安定", ok: "踏切×ポール角：やや不安定", bad: "踏切×ポール角：不安定", advice: "踏切位置を一定に（目印を作る）" },
    drive: { good: "離陸の突っ込み：十分", ok: "離陸の突っ込み：やや不足", bad: "離陸の突っ込み：不足", advice: "踏切後も前に進む意識（引き上げを急がない）" },
    inversion: { good: "反転タイミング：適切", ok: "反転タイミング：やや早い", bad: "反転タイミング：早すぎ", advice: "ポールの戻りを待ってから反転に入る意識" },
  };

  const focusKey =
    order.find((k) => summary[k] === "bad") ||
    order.find((k) => summary[k] === "ok") ||
    "drive";

  const focus = titleMap[focusKey];
  const todayFocus = { title: focus[summary[focusKey]], advice: focus.advice };

  const details = {
    planting: { reason: "助走と植え込みの同期を見る項目です。", impact: "タイミングが合うと、踏切の力がポールに素直に伝わります。", drill: "助走の最後3歩を一定リズムで（動画でリズム確認）" },
    takeoff: { reason: "踏切位置とポール角の安定性を見る項目です。", impact: "ズレが減るほど、跳びが再現しやすくなります。", drill: "踏切位置にテープで目印（同じ位置で踏めるか）" },
    drive: { reason: "離陸直後に前へ進むエネルギーが残っているかを見る項目です。", impact: "突っ込みが出るほど、ポールへエネルギーを乗せやすくなります。", drill: "踏切後に“前を見る”意識で、引き上げを急がない" },
    inversion: { reason: "反転がポールの戻りと同期しているかを見る項目です。", impact: "同期すると、抜けで高さを作りやすくなります。", drill: "反転は“待ってから”入る（慌てて先に回らない）" },
  };

  return { summary, todayFocus, details };
}
