import { useMemo, useRef, useState } from "react";

const LABEL = {
  good: "◎",
  ok: "◯",
  bad: "△",
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// いったんMVP：fps/尺/解像度で「撮影条件チェック」→結果はダミーで返す
function checkVideo(meta) {
  const { duration, width, height, fps } = meta;

  // 解析不可（最低条件）
  if (!duration || duration < 2.0) {
    return {
      checkStatus: "error",
      message:
        "この動画では診断ができませんでした。\n助走〜反転まで映る動画で、もう一度お試しください。",
    };
  }
  if (!width || !height || Math.min(width, height) < 360) {
    return {
      checkStatus: "error",
      message:
        "この動画では診断ができませんでした。\n画質が低い可能性があります。もう一度お試しください。",
    };
  }

  // 注意（診断はする）
  if (fps && fps < 24) {
    return {
      checkStatus: "warning",
      message: "この動画は撮影条件の影響により、診断結果は「参考値」となります。",
    };
  }
  if (duration > 20) {
    return {
      checkStatus: "warning",
      message:
        "動画が長めのため、診断結果は「参考値」となります。\n（助走〜反転が短く収まる動画が安定します）",
    };
  }

  // OK
  return {
    checkStatus: "ok",
    message: "動画を確認しました。フォーム診断を開始します。",
  };
}

// MVP：いまは“見た目の診断”を演出するためのダミーロジック
// 将来ここを「解析APIの結果」に置き換える
function diagnoseDummy(meta) {
  // duration・fps・解像度から“それっぽい”ばらつきを作る（固定的に再現されるように）
  const seed =
    (meta.duration || 0) * 1000 +
    (meta.fps || 0) * 10 +
    (meta.width || 0) +
    (meta.height || 0);

  const r = (k) => {
    const x = Math.sin(seed * (k + 1)) * 10000;
    return x - Math.floor(x); // 0..1
  };

  const pick = (x) => {
    // 0..1 を good/ok/bad に
    if (x < 0.25) return "bad";
    if (x < 0.60) return "ok";
    return "good";
  };

  const summary = {
    planting: pick(r(1)),
    takeoff: pick(r(2)),
    drive: pick(r(3)),
    inversion: pick(r(4)),
  };

  // “今日の改善ポイント”は bad を優先して1つ選ぶ
  const order = ["drive", "planting", "takeoff", "inversion"];
  const titleMap = {
    planting: {
      good: "植え込みタイミング：適切",
      ok: "植え込みタイミング：やや早い",
      bad: "植え込みタイミング：早すぎ",
      advice: "助走リズムに合わせて植え込みを遅らせる意識",
    },
    takeoff: {
      good: "踏切×ポール角：安定",
      ok: "踏切×ポール角：やや不安定",
      bad: "踏切×ポール角：不安定",
      advice: "踏切位置を一定に（目印を作る）",
    },
    drive: {
      good: "離陸の突っ込み：十分",
      ok: "離陸の突っ込み：やや不足",
      bad: "離陸の突っ込み：不足",
      advice: "踏切後も前に進む意識（引き上げを急がない）",
    },
    inversion: {
      good: "反転タイミング：適切",
      ok: "反転タイミング：やや早い",
      bad: "反転タイミング：早すぎ",
      advice: "ポールの戻りを待ってから反転に入る意識",
    },
  };

  let focusKey = order.find((k) => summary[k] === "bad") || order.find((k) => summary[k] === "ok") || "drive";
  const focus = titleMap[focusKey];

  const todayFocus = {
    title: focus[summary[focusKey]],
    advice: focus.advice,
  };

  const details = {
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
  };

  return { summary, todayFocus, details };
}

export default function PoleVaultDiagnosis() {
  const videoRef = useRef(null);

  const [status, setStatus] = useState("idle"); // idle | ready | checking | analyzing | done | error
  const [videoUrl, setVideoUrl] = useState(null);
  const [meta, setMeta] = useState({ fps: null, duration: null, width: null, height: null });
  const [checkResult, setCheckResult] = useState(null);
  const [result, setResult] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const canDiagnose = useMemo(() => !!videoUrl && (status === "ready" || status === "done"), [videoUrl, status]);

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setStatus("ready");
    setCheckResult(null);
    setResult(null);
    setShowDetails(false);
    setMeta({ fps: null, duration: null, width: null, height: null });
  };

  // video のメタ情報が取れたら保存（fpsは正確に取れないことがあるので、取れたらラッキー）
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;

    const duration = v.duration;
    const width = v.videoWidth;
    const height = v.videoHeight;

    // fps推定（ブラウザで取れないことが多いので、nullでもOK）
    // 一応の推定として「durationが短い＆高解像度は60っぽい」などはやらず、未推定にしておく
    const fps = null;

    setMeta({ fps, duration, width, height });
  };

  const runCheckAndDiagnose = async () => {
    if (!videoUrl) return;

    // ★追加：メタ情報がまだ取れてない場合は止める
    if (!meta.duration || !meta.width || !meta.height) {
      setCheckResult({
        checkStatus: "warning",
        message: "動画情報を読み込み中です。少し待ってからもう一度「診断する」を押してください。",
      });
      return;
    }

    setStatus("checking");
    const chk = checkVideo(meta);
    setCheckResult(chk);

    if (chk.checkStatus === "error") {
      setStatus("error");
      return;
    }

    setStatus("analyzing");

    // 将来：ここでAPIへアップロード or videoIdを渡して解析
    // いまはダミー診断で返す（0.6秒だけ“処理中”演出）
    await new Promise((r) => setTimeout(r, 600));

    const resp = await fetch("https://mys5k2aiv5.execute-api.ap-northeast-1.amazonaws.com/dev/polevault/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });


    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      setCheckResult({
        checkStatus: "error",
        message: data.message || "診断に失敗しました。",
      });
      setStatus("error");
      return;
    }

    // サーバのチェック文言を表示
    setCheckResult({
      checkStatus: data.checkStatus,
      message: data.message,
    });

    // 結果表示（summary / todayFocus / details がそのまま使える）
    setResult({
      summary: data.summary,
      todayFocus: data.todayFocus,
      details: {
        planting: data.details?.planting || {
          reason: "—",
          impact: "—",
          drill: "—",
        },
        takeoff: data.details?.takeoff || {
          reason: "—",
          impact: "—",
          drill: "—",
        },
        drive: data.details?.drive || {
          reason: "—",
          impact: "—",
          drill: "—",
        },
        inversion: data.details?.inversion || {
          reason: "—",
          impact: "—",
          drill: "—",
        },
      },
    });

    setStatus("done");

  };

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 6 }}>棒高跳び フォーム診断</h1>
      <p style={{ marginTop: 0, marginBottom: 18 }}>動画1本で、今の跳びをチェック</p>

      {/* 撮影ガイド（最小） */}
      <details style={{ marginBottom: 14 }}>
        <summary style={{ cursor: "pointer" }}>撮影ガイド</summary>
        <div style={{ marginTop: 10, lineHeight: 1.7 }}>
          <div>・横から撮影してください</div>
          <div>・助走の途中から反転まで映るようにしてください</div>
          <div>・体とポール全体がフレーム内に入ると診断が安定します</div>
        </div>
      </details>

      {/* アップロード */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <input type="file" accept="video/*" onChange={onFileChange} />
        <button disabled={!canDiagnose || status === "checking" || status === "analyzing"} onClick={runCheckAndDiagnose}>
          診断する
        </button>
        {(status === "checking" || status === "analyzing") && <span>処理中…</span>}
      </div>

      {/* チェックメッセージ */}
      {checkResult?.message && (
        <div
          style={{
            whiteSpace: "pre-line",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ddd",
            marginBottom: 12,
          }}
        >
          {checkResult.message}
        </div>
      )}

      {/* 動画プレビュー */}
      {videoUrl && (
        <div style={{ marginBottom: 18 }}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            style={{ width: "100%", maxWidth: 720, borderRadius: 12, border: "1px solid #eee" }}
            onLoadedMetadata={onLoadedMetadata}
          />
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            参考：{meta.width}×{meta.height} / {meta.duration ? `${meta.duration.toFixed(2)}s` : "-"} / FPS：{meta.fps ?? "（未取得）"}
          </div>
        </div>
      )}

      {/* 結果 */}
      {result && (
        <>
          <h2 style={{ marginBottom: 8 }}>診断結果</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
              植え込みタイミング：{LABEL[result.summary.planting]}
            </div>
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
              踏切 × ポール角：{LABEL[result.summary.takeoff]}
            </div>
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
              離陸の突っ込み：{LABEL[result.summary.drive]}
            </div>
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
              反転タイミング：{LABEL[result.summary.inversion]}
            </div>
          </div>

          <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>今日の改善ポイント</div>
            <div style={{ marginBottom: 8 }}>{result.todayFocus.title}</div>
            <div>
              次の1本は<br />
              「{result.todayFocus.advice}」
            </div>
          </div>

          <button onClick={() => setShowDetails((v) => !v)} style={{ marginBottom: 10 }}>
            {showDetails ? "詳細を閉じる" : "詳しく見る"}
          </button>

          {showDetails && (
            <div style={{ display: "grid", gap: 12 }}>
              {[
                ["planting", "植え込みタイミング"],
                ["takeoff", "踏切 × ポール角"],
                ["drive", "離陸の突っ込み"],
                ["inversion", "反転タイミング"],
              ].map(([key, title]) => (
                <div key={key} style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
                  <div style={{ marginBottom: 6 }}>なぜ？：{result.details[key].reason}</div>
                  <div style={{ marginBottom: 6 }}>このままだと？：{result.details[key].impact}</div>
                  <div>おすすめ練習：{result.details[key].drill}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
