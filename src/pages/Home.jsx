import { goToCheckout } from "../checkout";
import "../App.css";
import { useNavigate, Link } from "react-router-dom";
import { fetchAuthSession } from "aws-amplify/auth";

export default function Home() {
  const navigate = useNavigate();

  const requireLogin = async () => {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    if (!token) {
      navigate("/login", { state: { from: "/" } });
      return null;
    }
    return token;
  };

  const goToFormCompare = async () => {
    try {
      const token = await requireLogin();
      if (!token) return;

      const res = await fetch(
        "https://mys5k2aiv5.execute-api.ap-northeast-1.amazonaws.com/dev/subscription",
        { method: "GET", headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json().catch(() => ({}));

      const isActive =
        data?.isActive === true ||
        data?.isPaid === true ||
        data?.status === "active";

      if (res.ok && isActive) {
        navigate("/form-compare");
      } else {
        // 未加入なら決済へ（※ログイン済みの時だけ）
        goToCheckout();
      }
    } catch (e) {
      console.error(e);
      alert("会員チェックでエラーが出ました。もう一度ログインして試してください。");
      navigate("/login", { state: { from: "/" } });
    }
  };

  const startSubscription = async () => {
    try {
      const token = await requireLogin();
      if (!token) return;
      goToCheckout();
    } catch (e) {
      console.error(e);
      navigate("/login", { state: { from: "/" } });
    }
  };

  return (
    <div className="sl-page">
      <main className="sl-shell">
        <header className="sl-header">
          <div className="sl-mark" aria-hidden>
            <span className="sl-cloud" />
            <span className="sl-cloud sl-cloud2" />
          </div>

          <h1 className="sl-title">SoraLab</h1>
          <p className="sl-sub">
            からだと心のフォームを、やさしく可視化する。
            <br />
            がんばるあなたの“整う”を、そっと支えます。
          </p>
        </header>

        <section className="sl-grid">
          <div className="sl-card">
            <h2 className="sl-cardTitle">ご利用中の方</h2>
            <p className="sl-cardText">
              いつもの分析へ。今日の状態に合わせて、無理なく進めましょう。
            </p>

            <button className="sl-btn sl-btnPrimary" onClick={goToFormCompare}>
              フォーム比較アプリへ
            </button>

            <p className="sl-note">※契約状況の確認は次のステップでつなぎます</p>
          </div>

          <div className="sl-card">
            <h2 className="sl-cardTitle">はじめての方</h2>
            <p className="sl-cardText">
              月額¥500で、フォーム比較を含む分析サービスが利用できます。
              <br />
              まずは安心してお試しください。
            </p>

            <button className="sl-btn sl-btnGhost" onClick={startSubscription}>
              月額サービスをはじめる
            </button>

            <p className="sl-note">
              返金/解約ポリシーは、決済後ページとトップにも表示します
            </p>
          </div>
        </section>

        <div style={{ marginTop: 10, textAlign: "center" }}>
          <Link className="sl-link" to="/polevault">
            棒高跳びフォーム診断（無料・試作）
          </Link>
        </div>

        <footer className="sl-footer">
          <a className="sl-link" href="/tokushoho">特定商取引法に基づく表記</a>
          <span className="sl-dot">•</span>
          <a className="sl-link" href="/refund">返金・キャンセルについて</a>
          <span className="sl-dot">•</span>
          <a className="sl-link" href="/contact">お問い合わせ</a>
        </footer>
      </main>
    </div>
  );
}
