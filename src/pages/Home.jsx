import { goToCheckout } from "../checkout";
import "../App.css";
import { useNavigate } from "react-router-dom";
import { fetchAuthSession } from "aws-amplify/auth";

export default function Home() {
  const navigate = useNavigate();

  const goToFormCompare = async () => {
    try {
      // 1) CognitoのIDトークン取得
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        // 未ログイン扱い（ログイン導線があるならそこへ）
        alert("ログインが必要です。いったんログインしてください。");
        return;
      }

      // 2) /subscription を叩く（ヘッダーにAuthorization）
      const res = await fetch(
        "https://mys5k2aiv5.execute-api.ap-northeast-1.amazonaws.com/dev/subscription",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );

      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      // 3) 判定（まずはシンプル）
      // 返ってくるJSONに isPaid / status / isActive が入るようになったらここで判定できます
      const isActive =
        data?.isActive === true ||
        data?.isPaid === true ||
        data?.status === "active";

      if (res.ok && isActive) {
        navigate("/form-compare");
      } else {
        // NGなら決済へ
        goToCheckout();
      }
    } catch (e) {
      console.error(e);
      alert("会員チェックでエラーが出ました。もう一度ログインして試してください。");
    }
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
