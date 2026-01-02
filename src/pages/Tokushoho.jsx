// src/Tokushoho.jsx
export default function Tokushoho() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>特定商取引法に基づく表記</h1>

        <Section title="販売事業者名">SoraLab（ソララボ）</Section>
        <Section title="運営責任者">中野 奈未</Section>

        <Section title="所在地">
          請求があった場合、遅滞なく開示いたします。
        </Section>
        <Section title="電話番号">
          請求があった場合、遅滞なく開示いたします。
        </Section>

        <Section title="メールアドレス">
          nakano.n@sora-lab.biz
        </Section>

        <Section title="販売URL">
          https://main.dvlikxymh6o1o.amplifyapp.com/
        </Section>

        <hr style={styles.hr} />

        <Section title="販売価格">月額 500円（税込）</Section>

        <Section title="商品・サービスの内容">
          SoraLabは、身体の動きやフォームをやさしく可視化し、比較・理解を助けるWebアプリケーションサービスです。
          <br />
          月額サブスクリプションにより、フォーム比較アプリなどの各種分析機能をご利用いただけます。
        </Section>

        <Section title="商品代金以外の必要料金">
          インターネット接続に必要な通信料（通信料金はお客様のご負担となります）
        </Section>

        <Section title="支払方法">クレジットカード決済（Stripe）</Section>

        <Section title="支払時期">
          初回お申し込み時に課金され、以後は毎月同日に自動更新されます。
        </Section>

        <Section title="サービス提供時期">
          決済完了後、直ちにご利用いただけます。
        </Section>

        <Section title="返品・キャンセルについて">
          デジタルサービスの性質上、決済完了後の返金・キャンセルはお受けしておりません。
          <br />
          ただし、サービスの不具合等があった場合は、個別に状況を確認の上、誠意をもって対応いたします。
        </Section>

        <Section title="解約について">
          解約をご希望の場合は、次回更新日の前日までに所定の方法によりお手続きください。
          <br />
          解約後は、次回以降の請求は発生いたしません。
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.label}>{title}</div>
      <div style={styles.value}>{children}</div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f4fbff",
    padding: "32px 16px",
    display: "flex",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 900,
    background: "white",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
  },
  h1: {
    fontSize: 24,
    margin: "0 0 16px",
  },
  section: {
    padding: "12px 0",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },
  label: {
    fontSize: 13,
    color: "rgba(0,0,0,0.55)",
    marginBottom: 6,
  },
  value: {
    fontSize: 15,
    lineHeight: 1.7,
    color: "rgba(0,0,0,0.88)",
    wordBreak: "break-word",
  },
  hr: {
    border: "none",
    borderTop: "1px solid rgba(0,0,0,0.10)",
    margin: "16px 0",
  },
};
