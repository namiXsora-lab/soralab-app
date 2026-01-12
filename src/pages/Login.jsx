import { useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { signIn, signOut, resetPassword, confirmResetPassword } from "aws-amplify/auth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/form-compare";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // パスワード再設定用
  const [mode, setMode] = useState("login"); // "login" | "forgot" | "confirm"
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [info, setInfo] = useState("");

  // ✅ すでにログインしてたら一旦ログアウト（例のエラー対策）
  useEffect(() => {
    (async () => {
      try {
        await signOut();
      } catch {
        // 未ログインなら何もしない
      }
    })();
  }, []);

  const onLogin = async () => {
    setErr("");
    setLoading(true);
    console.log("LOGIN CLICK", { email });

    try {
      const res = await signIn({ username: email, password });
      console.log("SIGNIN OK", res);
      navigate(from, { replace: true });
    } catch (e) {
      console.log("SIGNIN NG", e);
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


  // ✅ パスワードリセット（コード送信）
  const onSendResetCode = async () => {
    setErr("");
    setInfo("");
    setLoading(true);
    try {
      await resetPassword({ username: email });
      setMode("confirm");
      setInfo("確認コードをメールに送りました。届いたコードと新しいパスワードを入力してください。");
    } catch (e) {
      setErr(e?.message || "確認コードの送信に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // ✅ パスワードリセット（コード確定）
  const onConfirmReset = async () => {
    setErr("");
    setInfo("");
    setLoading(true);
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
      setMode("login");
      setInfo("パスワードを更新しました。新しいパスワードでログインしてください。");
      setPassword("");
      setCode("");
      setNewPassword("");
    } catch (e) {
      setErr(e?.message || "パスワード更新に失敗しました。");
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

        {mode === "login" && (
          <>
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

            <button
              onClick={onLogin}
              disabled={loading || !email || !password}
              style={{ padding: 10 }}
            >
              {loading ? "ログイン中..." : "ログイン"}
            </button>

            <button
              onClick={() => setMode("forgot")}
              disabled={loading}
              style={{ padding: 10, background: "transparent", border: "1px solid #ccc" }}
            >
              パスワードを忘れた方
            </button>

            <p style={{ marginTop: 12 }}>
              はじめての方は <Link to="/signup">新規登録</Link>
            </p>
          </>
        )}

        {mode === "forgot" && (
          <>
            <p>入力したメール宛に確認コードを送ります。</p>
            <button
              onClick={onSendResetCode}
              disabled={loading || !email}
              style={{ padding: 10 }}
            >
              {loading ? "送信中..." : "確認コードを送る"}
            </button>

            <button
              onClick={() => setMode("login")}
              disabled={loading}
              style={{ padding: 10, background: "transparent", border: "1px solid #ccc" }}
            >
              ログインに戻る
            </button>
          </>
        )}

        {mode === "confirm" && (
          <>
            <label>
              確認コード（メールに届いた数字）
              <input
                style={{ width: "100%", padding: 8, marginTop: 4 }}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>

            <label>
              新しいパスワード
              <input
                style={{ width: "100%", padding: 8, marginTop: 4 }}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            <button
              onClick={onConfirmReset}
              disabled={loading || !email || !code || !newPassword}
              style={{ padding: 10 }}
            >
              {loading ? "更新中..." : "パスワードを更新する"}
            </button>

            <button
              onClick={() => setMode("login")}
              disabled={loading}
              style={{ padding: 10, background: "transparent", border: "1px solid #ccc" }}
            >
              ログインに戻る
            </button>
          </>
        )}

        {info && <div style={{ color: "teal" }}>{info}</div>}
        {err && <div style={{ color: "crimson" }}>{err}</div>}
      </div>
    </div>
  );
}
