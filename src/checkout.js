// src/checkout.js
import { fetchAuthSession } from "aws-amplify/auth";

// あなたの Function URL（これでOK）
const CHECKOUT_URL =
  "https://iap7rjj3eccm26idib5qbjhfhu0tcfdd.lambda-url.ap-northeast-1.on.aws/";

export async function goToCheckout() {
  try {
    // 1) Cognitoログイン情報（トークン）を取得
    const session = await fetchAuthSession();

    // 2) userSub（ユーザー固有ID）を取り出す
    const userSub = session.tokens?.idToken?.payload?.sub;

    // ★ここが「追記したい場所」：今取れた userSub を表示して確認する
    console.log("userSub:", userSub);

    // 3) 取れなければ、ログインが切れてる（or 取得できてない）
    if (!userSub) {
      alert("ログイン情報が取得できません。ログアウト→ログインし直してください。");
      return;
    }

    // 4) userSub を URL に付けて Lambda に送る（GET）
    const url = `${CHECKOUT_URL}?userSub=${encodeURIComponent(userSub)}`;

    console.log("Calling checkout url:", url);

    const res = await fetch(url, { method: "GET" });

    // 5) Lambdaの応答を読む
    const text = await res.text();
    console.log("Lambda raw response:", res.status, text);

    // 6) JSONとして解釈
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("Response is not JSON:", text);
      alert("サーバー応答が不正です（JSONではありません）。");
      return;
    }

    // 7) エラーなら内容を表示
    if (!res.ok) {
      console.error("Checkout error:", data);
      alert(data?.message || "決済開始でエラーが発生しました。");
      return;
    }

    // 8) 決済URLへ遷移
    if (data.url) {
      window.location.href = data.url;
      return;
    }

    console.error("No url in response:", data);
    alert("決済URLを取得できませんでした。");
  } catch (e) {
    console.error("goToCheckout error:", e);
    alert("決済処理でエラーが発生しました。");
  }
}
