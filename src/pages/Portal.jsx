// src/pages/Portal.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuthSession } from "aws-amplify/auth";
import { get } from "aws-amplify/api";

export default function Portal() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        // 1) ログインチェック（未ログインならログインへ）
        const session = await fetchAuthSession();
        const token = session.tokens?.accessToken?.toString();
        if (!token) {
          navigate("/login");
          return;
        }

        // 2) Customer PortalのURLをサーバ側で発行してもらう
        const resp = await get({
          apiName: "billingApi",
          path: "/portal",
          options: { authMode: "userPool" },
        }).response;

        const data = JSON.parse(await resp.body.text());

        if (data?.url) {
          window.location.href = data.url; // Stripeへ遷移
        } else {
          alert("ポータルURLの取得に失敗しました。");
          navigate("/");
        }
      } catch (e) {
        console.error(e);
        alert("エラーが出ました。もう一度ログインして試してください。");
        navigate("/login");
      }
    })();
  }, [navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>お支払い管理ページを開いています…</h2>
      <p>数秒たっても進まない場合は、いったんトップへ戻ってやり直してください。</p>
    </div>
  );
}
