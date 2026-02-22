import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { goToCheckout } from "../checkout";

export default function Portal() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("お支払い管理ページを開いています…");

  useEffect(() => {
    (async () => {
      try {
        // 未ログインならログインへ
        try {
          await getCurrentUser();
        } catch {
          navigate("/login", { state: { from: "/portal" } });
          return;
        }

        const session = await fetchAuthSession();
        const token =
          session.tokens?.idToken?.toString() ||
          session.tokens?.accessToken?.toString() ||
          "";

        if (!token) {
          navigate("/login", { state: { from: "/portal" } });
          return;
        }

        const baseUrl = import.meta.env.VITE_API_BASE_URL;
        const res = await fetch(`${baseUrl}/portal`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        const text = await res.text();
        let data = {};
        try { data = JSON.parse(text); } catch {}

        if (res.ok && data?.url) {
          window.location.href = data.url;
          return;
        }

        // ★ここが改善ポイント：未契約なら丁寧に案内
        const msg = data?.message || text || "ポータルURLの取得に失敗しました。";
        setMessage(msg);
      } catch (e) {
        console.error(e);
        setMessage("エラーが出ました。もう一度ログインして試してください。");
      }
    })();
  }, [navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>お支払い管理</h2>
      <p>{message}</p>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={() => navigate("/")}>トップへ戻る</button>
        <button onClick={goToCheckout}>月額登録へ進む</button>
      </div>
    </div>
  );
}