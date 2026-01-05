// src/checkout.js
import { fetchAuthSession } from "aws-amplify/auth";

const CHECKOUT_URL =
  "https://iap7rjj3eccm26idib5qbjhfhu0tcfdd.lambda-url.ap-northeast-1.on.aws/";

export async function goToCheckout() {
  try {
    // ★ Cognitoのセッション取得
    const session = await fetchAuthSession();
    const userSub = session.tokens?.idToken?.payload?.sub;

    if (!userSub) {
      alert("ログイン情報が取得できません。再ログインしてください。");
      return;
    }

    // ★ userSub をクエリに付与
    const url = `${CHECKOUT_URL}?userSub=${encodeURIComponent(userSub)}`;

    const res = await fetch(url, {
      method: "GET",
    });

    const text = await res.text();
    console.log("Lambda raw response:", res.status, text);

    let data = {};
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error("JSONパースエラー:", parseErr);
      alert("サーバーからの応答が不正です（JSONではありません）。");
      return;
    }

    if (!res.ok) {
      console.error("Lambda側のエラー:", data);
      alert("サーバー側でエラーが発生しました。");
      return;
    }

    if (data.url) {
      window.location.href = data.url; // Stripe決済画面へ
    } else {
      console.error("url がレスポンスに含まれていません:", data);
      alert("決済ページを開けませんでした。");
    }
  } catch (e) {
    console.error("goToCheckout 内での想定外エラー:", e);
    alert("決済処理でエラーが発生しました。");
  }
}
