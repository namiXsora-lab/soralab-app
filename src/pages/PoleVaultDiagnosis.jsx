import { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// 角度を -PI..PI に正規化
function normRad(a) {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

// 扇形（角度弧）を描く：centerを頂点に vecA と vecB のなす角を描画
function drawAngleWedge(ctx, center, vecA, vecB, radius, label, opt = {}) {
  const {
    fill = "rgba(255, 255, 0, 0.18)",
    stroke = "rgba(255, 255, 0, 0.9)",
    textColor = "white",
  } = opt;

  const a1 = Math.atan2(vecA.y, vecA.x);
  const a2 = Math.atan2(vecB.y, vecB.x);

  // 「短いほうの回り」で弧を描く（0〜180°側）
  let delta = normRad(a2 - a1);
  let start = a1;
  let end = a1 + delta;

  // 180°より大きくなったら逆側へ
  if (Math.abs(delta) > Math.PI) {
    delta = normRad(a1 - a2);
    start = a2;
    end = a2 + delta;
  }

  // 扇形
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.arc(center.x, center.y, radius, start, end, delta < 0);
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(2, Math.round(radius / 10));
  ctx.stroke();

  // ラベル（扇形の中心寄り）
  const mid = (start + end) / 2;
  const tx = center.x + Math.cos(mid) * (radius + 14);
  const ty = center.y + Math.sin(mid) * (radius + 14);

  // 文字の可読性：黒フチ＋白文字
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.strokeText(label, tx, ty);
  ctx.fillStyle = textColor;
  ctx.fillText(label, tx, ty);

  ctx.restore();
}

// ★ import の下（angleBetweenの近く）に追加
function drawMarker(ctx, x, y, label, opt = {}) {
  const r = opt.r ?? 14;

  ctx.save();
  ctx.globalAlpha = opt.alpha ?? 0.95;

  // ●黒丸（背景）
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = opt.bg ?? "rgba(0,0,0,0.70)";
  ctx.fill();

  // ○白フチ
  ctx.lineWidth = opt.borderW ?? 3;
  ctx.strokeStyle = opt.border ?? "rgba(255,255,255,0.95)";
  ctx.stroke();

  // 文字（白）
  ctx.fillStyle = opt.text ?? "white";
  ctx.font = `bold ${opt.fontSize ?? 16}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);

  ctx.restore();
}

/**
 * 2つの2Dベクトル(v1, v2)のなす角（0〜180度）
 */
function angleBetween(v1, v2) {
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  if (mag1 === 0 || mag2 === 0) return null;
  const cos = dot / (mag1 * mag2);
  const clamped = Math.min(Math.max(cos, -1), 1);
  return Math.acos(clamped) * (180 / Math.PI);
}

export default function PoleVaultDiagnosis() {
  const videoRef = useRef(null);

  // キャプチャ用（非表示）
  const captureCanvasRef = useRef(null);

  // MediaPipe
  const landmarkerRef = useRef(null);
  const [poseReady, setPoseReady] = useState(false);

  // UI状態
  const [videoUrl, setVideoUrl] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [capturedUrl, setCapturedUrl] = useState(null);

  // 角度（画面にも出す）
  const [angles, setAngles] = useState({
    leftDeg: null, // 体幹×左上腕のなす角
    rightDeg: null,
  });

  // 画面メッセージ
  const [msg, setMsg] = useState("");

  // 追加：表示用overlay（キャプチャ画像の上に重ねる）
  const overlayCanvasRef = useRef(null);

  // 追加：最後に推定できたランドマークを保持
  const [poseLandmarks, setPoseLandmarks] = useState(null);

  // 追加：キャプチャ画像のピクセルサイズを保持
  const [captureSize, setCaptureSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!capturedUrl || !poseLandmarks) return;

    // 表示されているcanvasの実寸で描画し直す
    const canvas = overlayCanvasRef.current;
    const imgCanvasW = canvas?.clientWidth;
    const imgCanvasH = canvas?.clientHeight;
    if (!imgCanvasW || !imgCanvasH) return;

    drawPoseOnOverlay(poseLandmarks, imgCanvasW, imgCanvasH);
  }, [capturedUrl, poseLandmarks]);

  // MediaPipe 初期化
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        setMsg("骨格推定モデルを読み込み中…");

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "IMAGE",
          numPoses: 1,
        });

        if (!cancelled) {
          landmarkerRef.current = landmarker;
          setPoseReady(true);
          setMsg("✅ 骨格推定 準備OK（キャプチャで推定します）");
          console.log("✅ PoseLandmarker ready");
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setPoseReady(false);
          setMsg("❌ 骨格推定の初期化に失敗しました（コンソールを確認）");
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  // ファイル選択
  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    // 状態初期化
    setCapturedUrl(null);
    setAngles({
      leftDeg: null,
      rightDeg: null,
    });
    setMsg(poseReady ? "キャプチャして推定できます" : "骨格推定モデルの準備中…");
  };

  // コマ送り（secだけ移動）
  const nudge = (sec) => {
    const v = videoRef.current;
    if (!v) return;

    v.pause();
    const t = Math.max(0, Math.min(v.duration || 0, (v.currentTime || 0) + sec));
    v.currentTime = t;
    setCurrentTime(t);
  };

  // 追加：ランドマーク配列(index)から線を引くためのペア
  const POSE_CONNECTIONS = [
    // 顔まわり（必要なら減らしてOK）
    [0, 1], [1, 2], [2, 3], [3, 7],
    [0, 4], [4, 5], [5, 6], [6, 8],
    [9, 10],

    // 体幹
    [11, 12], // 肩
    [11, 23], // 左肩-左股
    [12, 24], // 右肩-右股
    [23, 24], // 股

    // 左腕
    [11, 13],
    [13, 15],

    // 右腕
    [12, 14],
    [14, 16],

    // 左脚
    [23, 25],
    [25, 27],
    [27, 31],
    [27, 29],

    // 右脚
    [24, 26],
    [26, 28],
    [28, 32],
    [28, 30],
  ];

  // 追加：overlay canvas に骨格を描く
  // 追加：overlay canvas に骨格を描く
  function drawPoseOnOverlay(landmarks) {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !landmarks) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const ctx = canvas.getContext("2d");

    // ★① transform を完全リセット → ★② 内部解像度でクリア → ★③ CSS座標系へ
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 主要ランドマーク（★ここで1回だけ定義）
    const ls = landmarks[11];
    const rs = landmarks[12];
    const le = landmarks[13];
    const re = landmarks[14];
    const lh = landmarks[23];
    const rh = landmarks[24];

    // 線
    ctx.strokeStyle = "yellow";
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(2, Math.round(w / 500));

    for (const [a, b] of POSE_CONNECTIONS) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (!pa || !pb) continue;

      const va = pa.visibility ?? 1;
      const vb = pb.visibility ?? 1;
      if (va < 0.5 || vb < 0.5) continue;

      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }

    // ===== ①② 扇形（体幹×上腕） =====
    if (ls && rs && lh && rh && le && re) {
      const LS = { x: ls.x * w, y: ls.y * h };
      const RS = { x: rs.x * w, y: rs.y * h };
      const LE = { x: le.x * w, y: le.y * h };
      const RE = { x: re.x * w, y: re.y * h };

      const shoulderMid = { x: ((ls.x + rs.x) / 2) * w, y: ((ls.y + rs.y) / 2) * h };
      const hipMid = { x: ((lh.x + rh.x) / 2) * w, y: ((lh.y + rh.y) / 2) * h };

      const trunkVec = { x: hipMid.x - shoulderMid.x, y: hipMid.y - shoulderMid.y };
      const leftArmVec = { x: LE.x - LS.x, y: LE.y - LS.y };
      const rightArmVec = { x: RE.x - RS.x, y: RE.y - RS.y };

      const radius = Math.max(22, Math.round(w / 18));

      drawAngleWedge(ctx, LS, trunkVec, leftArmVec, radius, "①", {
        fill: "rgba(76, 201, 240, 0.22)",
        stroke: "rgba(76, 201, 240, 0.95)",
      });

      drawAngleWedge(ctx, RS, trunkVec, rightArmVec, radius, "②", {
        fill: "rgba(76, 201, 240, 0.22)",
        stroke: "rgba(76, 201, 240, 0.95)",
      });
    }

    // ③④：肘の外側に逃がす（被りにくい）
    if (ls && le) {
      const dx = le.x - ls.x;
      const dy = le.y - ls.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      const off = Math.max(18, Math.round(w / 60)); // 画面サイズで調整
      const mx = le.x * w + ux * off;
      const my = le.y * h + uy * off;

    }

    if (rs && re) {
      const dx = re.x - rs.x;
      const dy = re.y - rs.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      const off = Math.max(18, Math.round(w / 60));
      const mx = re.x * w + ux * off;
      const my = re.y * h + uy * off;

    }

  }

  // キャプチャ＆推定＆角度計算（ログ＋画面表示）
  const captureFrameAndEstimate = () => {
    const v = videoRef.current;
    const c = captureCanvasRef.current;

    if (!v || !c) return;

    // video のメタがまだなら待つ
    if (!v.videoWidth || !v.videoHeight) {
      setMsg("動画の読み込み中です。少し待ってからキャプチャしてください。");
      return;
    }

    // 1) キャプチャ
    c.width = v.videoWidth;
    c.height = v.videoHeight;

    // ここ（キャプチャ時にキャンバスへ描画した直後あたり）に追加
    setCaptureSize({ w: c.width, h: c.height });

    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0, c.width, c.height);

    const url = c.toDataURL("image/png");
    setCapturedUrl(url);

    // 2) 推定
    const landmarker = landmarkerRef.current;
    if (!landmarker) {
      setMsg("骨格推定の準備中です（少し待ってください）");
      console.warn("PoseLandmarker not ready yet");
      return;
    }

    setMsg("推定中…");

    const result = landmarker.detect(c);
    const landmarks = result?.landmarks?.[0];
    if (!landmarks) {
      setMsg("骨格が検出できませんでした（人物が小さい/ブレ/画角外の可能性）");
      console.warn("No pose detected");
      return;
    }

    setPoseLandmarks(landmarks);
    requestAnimationFrame(() => drawPoseOnOverlay(landmarks));

    // 3) 必要点を取り出し
    const ls = landmarks[11]; // left shoulder
    const rs = landmarks[12]; // right shoulder
    const le = landmarks[13]; // left elbow
    const re = landmarks[14]; // right elbow
    const lh = landmarks[23]; // left hip
    const rh = landmarks[24]; // right hip

    // 肩・股関節の中点
    const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };

    // 体幹ベクトル（肩→股関節）
    const trunkVec = { x: hipMid.x - shoulderMid.x, y: hipMid.y - shoulderMid.y };

    // 上腕ベクトル（肩→肘）
    const leftArmVec = { x: le.x - ls.x, y: le.y - ls.y };
    const rightArmVec = { x: re.x - rs.x, y: re.y - rs.y };

    // 角度（0〜180）
    const leftDeg = angleBetween(trunkVec, leftArmVec);
    const rightDeg = angleBetween(trunkVec, rightArmVec);

    if (leftDeg == null || rightDeg == null) {
      setMsg("角度計算に失敗しました（点が不安定な可能性）");
      return;
    }

        // ログ出し
    console.log("pose landmarks:", landmarks);
    console.log("体幹×左上腕(なす角):", leftDeg.toFixed(1));
    console.log("体幹×右上腕(なす角):", rightDeg.toFixed(1));

    // 画面表示
    setAngles({
      leftDeg,
      rightDeg,
    });

    setMsg("✅ 推定完了（次はここに描画を追加していこう）");
  };

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 6 }}>棒高跳び フォーム診断</h1>
      <p style={{ marginTop: 0, marginBottom: 18 }}>動画をコマ送り → キャプチャ → 骨格推定</p>

      {/* ステータス */}
      {msg && (
        <div
          style={{
            whiteSpace: "pre-line",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ddd",
            marginBottom: 12,
          }}
        >
          {msg}
        </div>
      )}

      {/* アップロード */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input type="file" accept="video/*" onChange={onFileChange} />
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          骨格推定: {poseReady ? "OK" : "準備中"}
        </span>
      </div>

      {/* 動画プレビュー */}
      {videoUrl && (
        <div style={{ marginBottom: 12 }}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            style={{ width: "100%", maxWidth: 720, borderRadius: 12, border: "1px solid #eee" }}
            onTimeUpdate={() => {
              const v = videoRef.current;
              if (!v) return;
              setCurrentTime(v.currentTime);
            }}
          />
        </div>
      )}

      {/* コマ送り＆キャプチャ */}
      {videoUrl && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={() => nudge(-0.1)}>◀︎ -0.10s</button>
          <button onClick={() => nudge(-0.03)}>◀︎ -0.03s</button>

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            現在: {currentTime.toFixed(2)}s
          </div>

          <button onClick={() => nudge(0.03)}>+0.03s ▶︎</button>
          <button onClick={() => nudge(0.1)}>+0.10s ▶︎</button>

          <button onClick={captureFrameAndEstimate} disabled={!poseReady}>
            この瞬間をキャプチャ（推定）
          </button>

          {/* キャプチャ用（非表示） */}
          <canvas ref={captureCanvasRef} style={{ display: "none" }} />
        </div>
      )}

      {/* 角度表示 */}
      {(angles.leftDeg != null || angles.rightDeg != null) && (
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, maxWidth: 720, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>角度（キャプチャ時点）</div>
          <div style={{ fontSize: 14, lineHeight: 1.7 }}>
            ・①体幹×左上腕（なす角）: {angles.leftDeg?.toFixed(1)}°
            <br />
            ・②体幹×右上腕（なす角）: {angles.rightDeg?.toFixed(1)}°
            <br />
          </div>
        </div>
      )}

      {/* キャプチャ画像 */}
      {capturedUrl && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ marginBottom: 8 }}>キャプチャ画像</h3>
          <div style={{ position: "relative", width: "100%", maxWidth: 720 }}>
            <img
              src={capturedUrl}
              onLoad={() => poseLandmarks && drawPoseOnOverlay(poseLandmarks)}
              alt="captured"
              style={{ width: "100%", borderRadius: 12, border: "1px solid #eee", display: "block" }}
            />
            <canvas
              ref={overlayCanvasRef}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                borderRadius: 12,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
