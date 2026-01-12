import { get } from "aws-amplify/api";
import { fetchAuthSession } from "aws-amplify/auth";

export async function getSubscription() {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString(); // ★accessToken推奨

  if (!token) throw new Error("Not signed in");

  const resp = await get({
    apiName: "billingApi",
    path: "/subscription",
    options: {
      authMode: "none", // ★ここ重要：自動付与に頼らず自前で付ける
      headers: {
        Authorization: `Bearer ${token}`, // ★Bearer付き
      },
    },
  }).response;

  const text = await resp.body.text();
  return JSON.parse(text);
}
