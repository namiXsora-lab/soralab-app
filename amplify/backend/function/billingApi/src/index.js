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
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
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
          isActive,
          subscription: item,
        }),
      };
    }

    // /checkout でも / でも許可（どちらかに寄せたいならここを調整）
    const okPath = path === "/" || path.endsWith("/checkout") || path.endsWith("/subscription");
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
