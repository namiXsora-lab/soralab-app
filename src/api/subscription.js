import { get } from "aws-amplify/api";
import { fetchAuthSession } from "aws-amplify/auth";

export async function getSubscription() {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();

  const resp = await get({
    apiName: "billingApi",      // aws-exports.js の name と一致させる
    path: "/subscription",
    options: {
      headers: token ? { Authorization: token } : {},
    },
  }).response;

  const text = await resp.body.text();
  return JSON.parse(text);
}
