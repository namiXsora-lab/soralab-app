import { useNavigate } from "react-router-dom";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function Refund() {
  const navigate = useNavigate();

  const goToCancelManage = async () => {
    try {
      // ① ログイン確認（未ログインならここで落ちる）
      await getCurrentUser();

      // ② トークン取得（最新に更新）
      const session = await fetchAuthSession({ forceRefresh: true });

      // ★まずは idToken を使う（API GatewayのJWT検証で通りやすい）
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        navigate("/login?next=/refund");
        return;
      }

      if (!API_BASE) {
        console.error("VITE_API_BASE_URL not set");
        return;
      }

      // ③ /portal API を叩いて、返ってきた url に遷移
      const res = await fetch(`${API_BASE}/portal`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("portal api error", res.status, data);
        return;
      }

      if (!data.url) {
        console.error("portal api: url not found", data);
        return;
      }

      window.location.href = data.url; // ★Stripe Customer Portalへ
    } catch (e) {
      console.error(e);
      navigate("/login?next=/refund");
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      {/* 省略：表示部分はそのままでOK */}
      <button onClick={goToCancelManage}>解約・お支払い管理へ（ログインが必要）</button>
    </div>
  );
}
