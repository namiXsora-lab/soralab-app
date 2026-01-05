/**
 * 課金状態チェック用 Lambda（仮）
 * 今は「ログインしていればOK」を返すだけ
 * 次に Stripe 判定を追加する
 */
exports.handler = async (event) => {
  console.log("EVENT:", JSON.stringify(event, null, 2));

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
    },
    body: JSON.stringify({
      isSubscribed: true, // ← 次にStripe連携で本物にする
    }),
  };
};
