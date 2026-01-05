import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signUp } from "aws-amplify/auth";

export default function Signup() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSignup = async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await signUp({
        username: email, // Emailログインなので username=メール
        password,
        options: {
          userAttributes: { email },
        },
      });

      // 確認コードが必要な場合、確認画面へ
      if (res?.nextStep?.signUpStep === "CONFIRM_SIGN_UP") {
        navigate(`/confirm?email=${encodeURIComponent(email)}`, { replace: true });
        return;
      }

      // まれに即時完了する設定の場合
      navigate("/login", { replace: true });
    } catch (e) {
      const msg =
        e?.name === "UsernameExistsException"
          ? "このメールアドレスはすでに登録されています。ログインしてください。"
          : e?.message || "登録に失敗しました。もう一度お試しください。";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h2>新規登録</h2>
      <p>メールアドレスとパスワードで登録します。</p>

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
          パスワード（8文字以上推奨）
          <input
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>

        {err && <div style={{ color: "crimson" }}>{err}</div>}

        <button
          onClick={onSignup}
          disabled={loading || !email || !password}
          style={{ padding: 10 }}
        >
          {loading ? "登録中..." : "登録する"}
        </button>
      </div>
    </div>
  );
}
