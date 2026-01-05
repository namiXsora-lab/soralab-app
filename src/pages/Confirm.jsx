import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { confirmSignUp, resendSignUpCode } from "aws-amplify/auth";

export default function Confirm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const email = useMemo(() => params.get("email") || "", [params]);

  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onConfirm = async () => {
    setErr("");
    setLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      navigate("/login", { replace: true });
    } catch (e) {
      setErr(e?.message || "確認に失敗しました。コードを確認してください。");
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setErr("");
    try {
      await resendSignUpCode({ username: email });
      alert("確認コードを再送しました。メールをご確認ください。");
    } catch (e) {
      setErr(e?.message || "再送に失敗しました。");
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h2>メール確認</h2>
      <p>登録したメールに届いた6桁コードを入力してください。</p>

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>メール：{email}</div>

        <label>
          確認コード
          <input
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            placeholder="例：123456"
          />
        </label>

        {err && <div style={{ color: "crimson" }}>{err}</div>}

        <button
          onClick={onConfirm}
          disabled={loading || !email || code.length < 4}
          style={{ padding: 10 }}
        >
          {loading ? "確認中..." : "確認する"}
        </button>

        <button onClick={onResend} type="button" style={{ padding: 10 }}>
          コードを再送する
        </button>
      </div>
    </div>
  );
}
