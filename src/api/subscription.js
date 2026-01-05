import { get } from "aws-amplify/api";

export async function getSubscription() {
  const resp = await get({
    apiName: "billingApi",      // aws-exports.js の aws_cloud_logic_custom.name と一致
    path: "/subscription",
    options: {
      authMode: "userPool",     // ← ここ重要
    },
  }).response;

  const text = await resp.body.text();
  return JSON.parse(text);
}
