const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/api/polevault/diagnose", (req, res) => {
  const { fps, duration, width, height } = req.body || {};

  // ---- チェック（超簡易）
  if (!duration || duration < 2) {
    return res.status(400).json({
      checkStatus: "error",
      message:
        "この動画では診断ができませんでした。\n助走〜反転まで映る動画で、もう一度お試しください。",
    });
  }

  const checkStatus = fps && fps < 24 ? "warning" : "ok";
  const message =
    checkStatus === "warning"
      ? "この動画は撮影条件の影響により、診断結果は「参考値」となります。"
      : "動画を確認しました。フォーム診断を開始します。";

  // ---- 仮の診断結果（固定の例。あとで本物に差し替え）
  const payload = {
    checkStatus,
    message,
    summary: {
      planting: "ok",
      takeoff: "good",
      drive: "bad",
      inversion: "ok",
    },
    todayFocus: {
      title: "離陸の突っ込み：不足",
      advice: "踏切後も前に進む意識（引き上げを急がない）",
    },

    details: {
      planting: {
        reason: "助走と植え込みの同期を見る項目です。",
        impact: "タイミングが合うと、踏切の力がポールに素直に伝わります。",
        drill: "助走の最後3歩を一定リズムで（動画でリズム確認）",
      },
      takeoff: {
        reason: "踏切位置とポール角の安定性を見る項目です。",
        impact: "ズレが減るほど、跳びが再現しやすくなります。",
        drill: "踏切位置にテープで目印（同じ位置で踏めるか）",
      },
      drive: {
        reason: "離陸直後に前へ進むエネルギーが残っているかを見る項目です。",
        impact: "突っ込みが出るほど、ポールへエネルギーを乗せやすくなります。",
        drill: "踏切後に“前を見る”意識で、引き上げを急がない",
      },
      inversion: {
        reason: "反転がポールの戻りと同期しているかを見る項目です。",
        impact: "同期すると、抜けで高さを作りやすくなります。",
        drill: "反転は“待ってから”入る（慌てて先に回らない）",
      },
    },
    
    metaEcho: { fps, duration, width, height },
  };

  res.json(payload);
});

const port = 8787;
app.listen(port, () => {
  console.log(`Mock API running: http://localhost:${port}`);
});
