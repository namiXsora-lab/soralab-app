// amplify/backend/function/billingApi/src/index.js
// REST API (/checkout) -> Stripe Checkout Session を作ってURLを返す
// 重要: Stripe側に userSub を埋め込む（client_reference_id / metadata / subscription_data.metadata）

const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const SUCCESS_URL =
  process.env.CHECKOUT_SUCCESS_URL ||
  "https://main.d3sy4qro8vglws.amplifyapp.com/success";
const CANCEL_URL =
  process.env.CHECKOUT_CANCEL_URL ||
  "https://main.d3sy4qro8vglws.amplifyapp.com/cancel";

function getUserSub(event) {
  // API Gateway(REST) + Cognito authorizer の典型
  const claims =
    event?.requestContext?.authorizer?.claims ||
    event?.requestContext?.authorizer?.jwt?.claims;

  return claims?.sub || null;
}

function getUserEmail(event) {
  const claims =
    event?.requestContext?.authorizer?.claims ||
    event?.requestContext?.authorizer?.jwt?.claims;

  return claims?.email || null;
}

exports.handler = async (event) => {
  console.log("EVENT:", JSON.stringify(event, null, 2));

  // CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json",
  };

  // preflight
  const method = event.requestContext?.httpMethod || event.httpMethod;
  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // /checkout だけ処理（他のパスが来たら 404）
    const path = event.path || "";
    if (!path.endsWith("/checkout")) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: "Not Found" }),
      };
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

    const email = getUserEmail(event);

    // ✅ ここが最重要：userSub を Stripe に埋め込む
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: CANCEL_URL,

      // どれか1つでも良いけど、後工程がラクなので全部入れる
      client_reference_id: userSub,
      metadata: { userSub },
      subscription_data: { metadata: { userSub } },

      ...(email ? { customer_email: email } : {}),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("checkout error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: "Internal Server Error",
        detail: err?.message,
      }),
    };
  }
};
