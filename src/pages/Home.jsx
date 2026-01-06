import { goToCheckout } from "../checkout";
import "../App.css";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  // ✅ React Routerでアプリ内遷移（ログイン制御できるようにする）
  const goToFormCompare = () => {
    navigate("/form-compare");
  };

  // ✅ いったんダミー（次にStripe Checkoutへつなぐ）
  const startSubscription = () => {
    goToCheckout();
  };

  return (
    <div className="sl-page">
      <main className="sl-shell">
        {/* ヘッダー */}
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

        {/* カード */}
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

        {/* フッター */}
        <footer className="sl-footer">
          <a className="sl-link" href="/tokushoho">
            特定商取引法に基づく表記
          </a>

          <span className="sl-dot">•</span>

          <a className="sl-link" href="/refund">
            返金・キャンセルについて
          </a>

          <span className="sl-dot">•</span>

          <a className="sl-link" href="/contact">
            お問い合わせ
          </a>
        </footer>
      </main>
    </div>
  );
}
