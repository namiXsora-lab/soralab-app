/**
 * billingApi Lambda
 * - GET /subscription : 課金状態（今は仮で true）
 * - GET /checkout     : Stripe Checkout Session を作って url を返す
 *
 * 前提：API Gateway 側で Cognito(UserPool) 認証を有効にしている（authMode: "userPool"）
 */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const PRICE_ID = process.env.STRIPE_PRICE_ID;

// success / cancel は、環境変数がなければ Amplify のURLにフォールバック
const SUCCESS_URL =
  process.env.CHECKOUT_SUCCESS_URL ||
  "https://main.dvlikxymh6o1o.amplifyapp.com/?status=success&session_id={CHECKOUT_SESSION_ID}";
const CANCEL_URL =
  process.env.CHECKOUT_CANCEL_URL ||
  "https://main.dvlikxymh6o1o.amplifyapp.com/?status=cancel";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

exports.handler = async (event) => {
  console.log("EVENT:", JSON.stringify(event, null, 2));

  // OPTIONS（プリフライト）
  const method =
    event.requestContext?.http?.method ||
    event.httpMethod; // 古い形式の保険
  if (method === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  // パス判定（REST API なのでここで分岐）
  const rawPath =
    event.rawPath ||
    event.path ||
    event.requestContext?.http?.path ||
    "";
  const path = rawPath.replace(/\/+$/, ""); // 末尾スラッシュ除去

  // Cognito の userSub を取得（認証できていればここに入る）
  const userSub =
    event.requestContext?.authorizer?.claims?.sub ||
    event.requestContext?.authorizer?.jwt?.claims?.sub;

  // ここからルーティング
  try {
    // --- /subscription ---
    if (path.endsWith("/subscription")) {
      // いまは仮：ログインできてればOKとして true
      // 次回：DynamoDB/Stripeで本物判定にする
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ isSubscribed: true }),
      };
    }

    // --- /checkout ---
    if (path.endsWith("/checkout")) {
      if (!userSub) {
        return {
          statusCode: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Unauthorized (no userSub)" }),
        };
      }

      if (!process.env.STRIPE_SECRET_KEY || !PRICE_ID) {
        return {
          statusCode: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({
            message:
              "Missing env vars: STRIPE_SECRET_KEY and/or STRIPE_PRICE_ID",
          }),
        };
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: PRICE_ID, quantity: 1 }],
        success_url: SUCCESS_URL,
        cancel_url: CANCEL_URL,

        // ★誰の購入かを紐づけ（Webhookで使う）
        client_reference_id: userSub,
        metadata: { userSub },
      });

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ url: session.url }),
      };
    }

    // --- 想定外のパス ---
    return {
      statusCode: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Not Found", path }),
    };
  } catch (error) {
    console.error("ERROR:", error);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Server Error", error: error.message }),
    };
  }
};
