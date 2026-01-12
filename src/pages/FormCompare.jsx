import { useEffect, useState } from "react";
import MainFormApp from "./MainFormApp"; // あなたの構成のままでOK
import { getSubscription } from "../api/subscription";
import { signOut } from "aws-amplify/auth";
import { useNavigate } from "react-router-dom";
import { fetchAuthSession } from "aws-amplify/auth";

export default function FormCompare() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // ① 未ログインならここで弾く（/loginへ）
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        if (!idToken) {
          navigate("/login", { replace: true });
          return;
        }

        // ② ログイン済みなら契約チェック
        const s = await getSubscription();
        setSub(s);
      } catch (e) {
        const msg = e?.message || "";

        // ③ Unauthorized系はログインへ飛ばす
        if (
          msg.includes("Unauthorized") ||
          msg.includes("NotAuthorized") ||
          msg.includes("No current user") ||
          msg.includes("Missing Authentication Token") ||
          msg.includes("401")
        ) {
          navigate("/login", { replace: true });
          return;
        }

        setErr("契約状況の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const logout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  if (loading) return <div style={{ padding: 24 }}>契約状況を確認中...</div>;
  if (err) return <div style={{ padding: 24, color: "crimson" }}>{err}</div>;

  // いまはLambdaが isSubscribed: true を返す想定（後でStripe連携で本物にする）
  if (!sub?.isSubscribed) {
    return (
      <div style={{ padding: 24 }}>
        <h2>有料プランが必要です</h2>
        <p>月額¥500のサブスクに登録すると利用できます。</p>

        <button onClick={() => navigate("/", { replace: true })}>
          トップへ戻る
        </button>

        <div style={{ marginTop: 12 }}>
          <button onClick={logout}>ログアウト</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: 8 }}>
        <button onClick={logout}>ログアウト</button>
      </div>

      <MainFormApp />
    </div>
  );
}

