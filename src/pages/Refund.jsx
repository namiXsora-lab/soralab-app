// src/pages/Refund.jsx
import { useNavigate } from "react-router-dom";
import { fetchAuthSession } from "aws-amplify/auth";

export default function Refund() {
  const navigate = useNavigate();

  const goToCancelManage = async () => {
    try {
      // 1) ログインセッションからトークン取得
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString(); // ← accessTokenでOK

      if (!token) {
        navigate("/login?next=/refund"); // ログイン後はRefundに戻す方が安全
        return;
      }

      // 2) API Gateway の /portal を Bearer付きで呼ぶ
      const baseUrl = import.meta.env.VITE_API_BASE_URL; // 例: https://xxxx.execute-api.../dev
      const res = await fetch(`${baseUrl}/portal`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("portal api error", res.status, data);
        // 認可がまだならログインに戻す（401対策）
        if (res.status === 401) navigate("/login?next=/refund");
        return;
      }

      if (!data.url) {
        console.error("portal api: url not found", data);
        return;
      }

      // 3) Stripe Customer Portalへ遷移
      window.location.href = data.url;
    } catch (e) {
      console.error(e);
      navigate("/login?next=/refund");
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 12 }}>返金・キャンセルについて</h1>

        <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 10px 24px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 16, margin: "6px 0 8px" }}>1. お支払いの「キャンセル」</h2>
          <p style={{ lineHeight: 1.8, marginTop: 0 }}>
            決済画面（Stripe Checkout）でお手続きを途中でやめた場合、料金は発生しません。
          </p>
          <button
            onClick={() => navigate("/cancel")}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            決済をやめた場合の画面を見る
          </button>

          <hr style={{ margin: "18px 0", border: "none", borderTop: "1px solid #eee" }} />

          <h2 style={{ fontSize: 16, margin: "6px 0 8px" }}>2. 有料プランの「解約」</h2>
          <p style={{ lineHeight: 1.8, marginTop: 0 }}>
            有料プランの解約は、管理ページ（Customer Portal）からいつでも行えます。
            <br />
            解約後も、次回更新日まではご利用いただけます。
          </p>

          <button
            onClick={goToCancelManage}
            style={{
              marginTop: 6,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 999,
              border: "none",
              background: "#3ba9ff",
              color: "#fff",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            解約・お支払い管理へ（ログインが必要）
          </button>

          <p style={{ marginTop: 10, fontSize: 12, color: "#666" }}>※まずログインしてからご利用ください</p>
        </div>
      </div>
    </div>
  );
}
