// amplify/backend/function/<yourWebhookFunc>/src/index.js
// Stripe Webhook（署名検証あり） + DynamoDBに課金状態を書き込み
//
// 必須環境変数：
// - STRIPE_WEBHOOK_SECRET   (whsec_...)
// - SUBSCRIPTIONS_TABLE     (例: Subscriptions-dev)
// 任意：
// - STRIPE_SECRET_KEY       (APIを叩く予定があるなら本物推奨。署名検証だけならダミーでも動く)
//
// 依存：stripe, @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb

const Stripe = require("stripe");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_dummy", {
  apiVersion: "2023-10-16",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const TABLE_NAME = process.env.SUBSCRIPTIONS_TABLE;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function getHeaderCaseInsensitive(headers = {}, name) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return lower[name.toLowerCase()];
}

async function upsertSubscriptionByUserSub(userSub, patch) {
  const now = new Date().toISOString();

  const exprNames = {}; // ★ #userSub を作らない
  const exprValues = { ":updatedAt": now };

  // updatedAt も # にして統一（地味に安全）
  exprNames["#updatedAt"] = "updatedAt";
  let updateExp = "SET #updatedAt = :updatedAt";

  for (const [k, v] of Object.entries(patch)) {
    exprNames[`#${k}`] = k;
    exprValues[`:${k}`] = v;
    updateExp += `, #${k} = :${k}`;
  }

  const cmd = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userSub }, // PKはこれでOK
    UpdateExpression: updateExp,
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues,
    ReturnValues: "ALL_NEW",
  });

  return ddb.send(cmd);
}

exports.handler = async (event) => {
  try {
    // 0) POST以外は弾く（StripeはPOST）
    const method =
      event?.requestContext?.http?.method ||
      event?.requestContext?.httpMethod ||
      event?.httpMethod ||
      "POST";

    if (method === "OPTIONS") return { statusCode: 200, body: "" };
    if (method !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    if (!WEBHOOK_SECRET) {
      console.error("Missing env STRIPE_WEBHOOK_SECRET");
      return { statusCode: 500, body: "Missing STRIPE_WEBHOOK_SECRET" };
    }
    if (!TABLE_NAME) {
      console.error("Missing env SUBSCRIPTIONS_TABLE");
      return { statusCode: 500, body: "Missing SUBSCRIPTIONS_TABLE" };
    }

    // 1) 署名ヘッダ取得（大小文字揺れ対策）
    const sig = getHeaderCaseInsensitive(event.headers, "stripe-signature");
    if (!sig) {
      console.error("Missing Stripe-Signature header");
      return { statusCode: 400, body: "Missing Stripe-Signature header" };
    }

    // 2) 生ボディ取得（署名検証は生が必須）
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";

    // 3) 署名検証してイベント構築
    const stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);

    console.log("✅ Stripe webhook verified:", stripeEvent.type);

    // 4) イベントごとにDynamoDB更新
    // userSub の取り出しは「client_reference_id」優先 → metadata.userSub でもOK
    const obj = stripeEvent.data?.object;

    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        const userSub = obj?.client_reference_id || obj?.metadata?.userSub;
        if (!userSub) {
          console.warn("No userSub in checkout.session.completed");
          break;
        }

        // subscriptionモードだと subscription / customer が入る
        const stripeSubscriptionId =
          typeof obj?.subscription === "string" ? obj.subscription : obj?.subscription?.id;
        const stripeCustomerId =
          typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id;

        await upsertSubscriptionByUserSub(userSub, {
          isPaid: true,
          status: "active", // “権限判定用のアプリ内ステータス”としてまずはこれでOK
          stripeCustomerId: stripeCustomerId || null,
          stripeSubscriptionId: stripeSubscriptionId || null,
        });

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // ここは userSub がmetadataに入っている前提（checkout側で subscription_data.metadata.userSub を入れてるのでOK）
        const userSub = obj?.metadata?.userSub;
        if (!userSub) {
          console.warn("No userSub in subscription event metadata");
          break;
        }

        const stripeSubscriptionId = obj?.id || null;
        const stripeCustomerId = typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id;

        // Stripeのstatusをそのまま保存（active/canceled/past_dueなど）
        const stripeStatus = obj?.status || null;

        // アプリ用 isPaid 判定（まずは超シンプルに）
        const isPaid = stripeStatus === "active" || stripeStatus === "trialing";

        // 👇 ここに追加
        console.log("update to active", {
          eventType: stripeEvent.type,
          userSub,
          stripeStatus,
          isPaid,
        });

        await upsertSubscriptionByUserSub(userSub, {
          isPaid,
          status: isPaid ? "active" : "inactive",
          stripeStatus,
          stripeCustomerId: stripeCustomerId || null,
          stripeSubscriptionId,
          cancelAtPeriodEnd: !!obj?.cancel_at_period_end,
          currentPeriodEnd: obj?.current_period_end ? Number(obj.current_period_end) : null, // unix秒
        });

        break;
      }

      case "invoice.paid": {
        // invoiceはsubscriptionのmetadataが見えないこともあるので、まずはログだけでもOK
        // 必要なら「subscriptionをretrieveしてmetadata.userSubを取りに行く」拡張を後で入れる
        break;
      }

      default:
        break;
    }

    // 5) 必ず2xx
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }
};
