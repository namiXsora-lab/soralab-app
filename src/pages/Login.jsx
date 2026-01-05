import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { signIn } from "aws-amplify/auth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/form-compare";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setErr("");
    setLoading(true);
    try {
      await signIn({ username: email, password });
      navigate(from, { replace: true });
    } catch (e) {
      // よくあるエラーを日本語で出す（ざっくり）
      const msg =
        e?.name === "NotAuthorizedException"
          ? "メールアドレスまたはパスワードが違います。"
          : e?.name === "UserNotFoundException"
          ? "そのメールアドレスのユーザーが見つかりません。まずは新規登録してください。"
          : e?.message || "ログインに失敗しました。もう一度お試しください。";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h2>ログイン</h2>
      <p>メールアドレスとパスワードでログインします。</p>

      <div style={{ display: "grid", gap: 12 }}>
        <label>
          メール
          <input
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label>
          パスワード
          <input
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {err && <div style={{ color: "crimson" }}>{err}</div>}

        <button
          onClick={onLogin}
          disabled={loading || !email || !password}
          style={{ padding: 10 }}
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>

        <p style={{ marginTop: 12 }}>
          はじめての方は <a href="/signup">新規登録</a>
        </p>
      </div>
    </div>
  );
}
