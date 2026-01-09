const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const PRICE_ID = process.env.STRIPE_PRICE_ID;

// ★ 戻り先（環境変数がなければ Amplify のURLを使う）
const SUCCESS_URL =
  process.env.CHECKOUT_SUCCESS_URL ||
  "https://main.d3sy4qro8vglws.amplifyapp.com/success";

const CANCEL_URL =
  process.env.CHECKOUT_CANCEL_URL ||
  "https://main.d3sy4qro8vglws.amplifyapp.com/cancel";

exports.handler = async (event) => {
  console.log("EVENT:", JSON.stringify(event, null, 2));

  // CORS（ブラウザから呼ぶため）
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
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (e) {
    console.error("checkout error:", e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: e.message }),
    };
  }
};
