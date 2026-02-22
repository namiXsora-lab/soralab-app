// src/pages/Portal.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";

export default function Portal() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        // 1) 未ログインならログインへ
        try {
          await getCurrentUser();
        } catch {
          navigate("/login", { state: { from: "/portal" } });
          return;
        }

        // 2) JWT取得
        const session = await fetchAuthSession();
        const token =
          session.tokens?.idToken?.toString() ||          // ★まず idToken
          session.tokens?.accessToken?.toString() || "";  // ★なければ accessToken

        if (!token) {
          navigate("/login", { state: { from: "/portal" } });
          return;
        }

        // 3) /portal をJWT付きで叩く（JWT Authorizer用）
        const baseUrl = import.meta.env.VITE_API_BASE_URL; // 例: https://...amazonaws.com/dev
        const res = await fetch(`${baseUrl}/portal`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401 || res.status === 403) {
          navigate("/login", { state: { from: "/portal" } });
          return;
        }

        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.url) {
          window.location.href = data.url;
        } else {
          alert(data?.message || "ポータルURLの取得に失敗しました。");
          navigate("/");
        }
      } catch (e) {
        console.error(e);
        alert("エラーが出ました。もう一度ログインして試してください。");
        navigate("/login", { state: { from: "/portal" } });
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