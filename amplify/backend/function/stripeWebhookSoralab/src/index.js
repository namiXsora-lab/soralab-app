// amplify/backend/function/<yourWebhookFunc>/src/index.js
// Stripe Webhook（署名検証あり）
//
// 必須環境変数：STRIPE_WEBHOOK_SECRET（whsec_...）
// 依存：stripe（npm i stripe）

const Stripe = require("stripe");

// 署名検証だけなら secretKey は不要だけど、StripeのSDKが必要なので初期化する
// （ダミーでOK。実際にStripe APIを叩く処理を後で入れる時に本物を使う）
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_dummy", {
  apiVersion: "2023-10-16",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

exports.handler = async (event) => {
  try {
    // 1) 署名ヘッダ取得（大文字小文字が揺れるので両対応）
    const sig =
      event.headers?.["stripe-signature"] ||
      event.headers?.["Stripe-Signature"];

    if (!WEBHOOK_SECRET) {
      console.error("Missing env STRIPE_WEBHOOK_SECRET");
      return {
        statusCode: 500,
        body: "Server misconfigured: missing STRIPE_WEBHOOK_SECRET",
      };
    }
    if (!sig) {
      console.error("Missing Stripe-Signature header");
      return { statusCode: 400, body: "Missing Stripe-Signature header" };
    }

    // 2) 生のボディ取得（署名検証は “生の文字列” が必須）
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";

    // 3) 署名検証してイベントを構築
    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      WEBHOOK_SECRET
    );

    console.log("✅ Stripe webhook verified:", stripeEvent.type);

    // 4) まずはログに出すだけ（次ステップでDynamoDB更新を入れる）
    // 必要に応じて event 内容を見る
    // console.log("event data:", JSON.stringify(stripeEvent.data, null, 2));

    // 例：今後使うイベント（王道）
    switch (stripeEvent.type) {
      case "checkout.session.completed":
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "invoice.paid":
        // TODO: DynamoDBに契約状態を書き込む（次ステップ）
        break;
      default:
        // 他のイベントは無視でOK
        break;
    }

    // 5) Stripeには必ず 2xx を返す（返さないと “失敗” になる）
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    // 署名NGやJSON不正などはここに入る
    console.error("❌ Webhook error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }
};
