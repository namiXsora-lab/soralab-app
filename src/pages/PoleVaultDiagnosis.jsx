import { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { useNavigate } from "react-router-dom";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { getSubscription } from "../api/subscription";

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

  let delta = normRad(a2 - a1);
  let start = a1;
  let end = a1 + delta;

  if (Math.abs(delta) > Math.PI) {
    delta = normRad(a1 - a2);
    start = a2;
    end = a2 + delta;
  }

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

  const mid = (start + end) / 2;
  const tx = center.x + Math.cos(mid) * (radius + 14);
  const ty = center.y + Math.sin(mid) * (radius + 14);

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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState(null);
  const [authErr, setAuthErr] = useState("");

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
    leftDeg: null,
    rightDeg: null,
  });

  // 画面メッセージ
  const [msg, setMsg] = useState("");

  // 表示用overlay（キャプチャ画像の上に重ねる）
  const overlayCanvasRef = useRef(null);

  // 最後に推定できたランドマークを保持
  const [poseLandmarks, setPoseLandmarks] = useState(null);

  // 解析範囲指定モード
  const [cropMode, setCropMode] = useState(false);
  const [dragRect, setDragRect] = useState(null);
  const dragStartRef = useRef(null);

  // キャプチャ画像のピクセルサイズを保持
  const [captureSize, setCaptureSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    (async () => {
      try {
        try {
          await getCurrentUser();
        } catch {
          navigate("/login", { replace: true });
          return;
        }

        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();

        if (!idToken) {
          navigate("/login", { replace: true });
          return;
        }

        const s = await getSubscription();
        setSub(s);
      } catch (e) {
        const msg = e?.message || "";

        if (
          msg.includes("Unauthorized") ||
          msg.includes("NotAuthorized") ||
          msg.includes("No current user") ||
          msg.includes("Missing Authentication Token") ||
          msg.includes("401")
        ) {
          navigate("/login", { replace: true });
          return;
        }

        setAuthErr("契約状況の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (!capturedUrl || !poseLandmarks) return;
    requestAnimationFrame(() => drawPoseOnOverlay(poseLandmarks));
  }, [capturedUrl, poseLandmarks]);

  useEffect(() => {
    if (!capturedUrl || !cropMode || !dragRect) return;
    requestAnimationFrame(() => drawCropRect(dragRect));
  }, [capturedUrl, cropMode, dragRect]);

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
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
            delegate: "GPU",
          },
          runningMode: "IMAGE",
          numPoses: 1,
          minPoseDetectionConfidence: 0.2,
          minPosePresenceConfidence: 0.2,
        });

        if (!cancelled) {
          landmarkerRef.current = landmarker;
          setPoseReady(true);
          setMsg("✅ 骨格推定 準備OK（キャプチャ後、選手を囲って推定します）");
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
    setAngles({ leftDeg: null, rightDeg: null });
    setPoseLandmarks(null);
    setCropMode(false);
    setDragRect(null);
    dragStartRef.current = null;
    setMsg(poseReady ? "キャプチャして解析範囲を指定できます" : "骨格推定モデルの準備中…");
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

  // ランドマーク配列(index)から線を引くためのペア
  const POSE_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 7],
    [0, 4], [4, 5], [5, 6], [6, 8],
    [9, 10],
    [11, 12],
    [11, 23],
    [12, 24],
    [23, 24],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
    [23, 25],
    [25, 27],
    [27, 31],
    [27, 29],
    [24, 26],
    [26, 28],
    [28, 32],
    [28, 30],
  ];

  function setupOverlayCanvas() {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return null;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return null;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return { canvas, ctx, w, h };
  }

  function clearOverlay() {
    const setup = setupOverlayCanvas();
    if (!setup) return;
  }

  // overlay canvas に骨格を描く
  function drawPoseOnOverlay(landmarks) {
    const setup = setupOverlayCanvas();
    if (!setup || !landmarks) return;

    const { ctx, w, h } = setup;

    const ls = landmarks[11];
    const rs = landmarks[12];
    const le = landmarks[13];
    const re = landmarks[14];
    const lh = landmarks[23];
    const rh = landmarks[24];

    ctx.strokeStyle = "yellow";
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(2, Math.round(w / 500));

    for (const [a, b] of POSE_CONNECTIONS) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (!pa || !pb) continue;

      const va = pa.visibility ?? 1;
      const vb = pb.visibility ?? 1;
      if (va < 0.35 || vb < 0.35) continue;

      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }

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
  }

  function drawCropRect(rect) {
    const setup = setupOverlayCanvas();
    if (!setup || !rect) return;

    const { ctx } = setup;

    ctx.save();

    // 外側を少し暗くする
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(0, 0, setup.w, setup.h);
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);

    // 選択範囲
    ctx.strokeStyle = "rgba(76, 201, 240, 0.98)";
    ctx.lineWidth = 3;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.fillStyle = "rgba(76, 201, 240, 0.12)";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.fillStyle = "white";
    const text = "この範囲を解析";
    const tx = rect.x + 8;
    const ty = Math.max(8, rect.y - 24);
    ctx.strokeText(text, tx, ty);
    ctx.fillText(text, tx, ty);

    ctx.restore();
  }

  function getCanvasPointFromMouse(e) {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function getCanvasPointFromTouch(e) {
    const canvas = overlayCanvasRef.current;
    const touch = e.touches?.[0] || e.changedTouches?.[0];
    if (!canvas || !touch) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }

  function makeRect(start, end) {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y),
    };
  }

  function handleCropStart(point) {
    if (!cropMode || !point) return;

    dragStartRef.current = point;
    const rect = { x: point.x, y: point.y, w: 0, h: 0 };
    setDragRect(rect);
    drawCropRect(rect);
  }

  function handleCropMove(point) {
    if (!cropMode || !dragStartRef.current || !point) return;

    const rect = makeRect(dragStartRef.current, point);
    setDragRect(rect);
    drawCropRect(rect);
  }

  function handleCropEnd(point) {
    if (!cropMode || !dragStartRef.current || !point) return;

    const rect = makeRect(dragStartRef.current, point);
    dragStartRef.current = null;
    setDragRect(rect);

    if (rect.w < 40 || rect.h < 40) {
      setMsg("範囲が小さすぎます。選手の全身を少し余裕を持って囲ってください。");
      drawCropRect(rect);
      return;
    }

    estimateCroppedArea(rect);
  }

  function handleCropMouseDown(e) {
    handleCropStart(getCanvasPointFromMouse(e));
  }

  function handleCropMouseMove(e) {
    handleCropMove(getCanvasPointFromMouse(e));
  }

  function handleCropMouseUp(e) {
    handleCropEnd(getCanvasPointFromMouse(e));
  }

  function handleCropTouchStart(e) {
    if (!cropMode) return;
    e.preventDefault();
    handleCropStart(getCanvasPointFromTouch(e));
  }

  function handleCropTouchMove(e) {
    if (!cropMode) return;
    e.preventDefault();
    handleCropMove(getCanvasPointFromTouch(e));
  }

  function handleCropTouchEnd(e) {
    if (!cropMode) return;
    e.preventDefault();
    handleCropEnd(getCanvasPointFromTouch(e));
  }

  function calculateAngles(landmarks) {
    const ls = landmarks[11];
    const rs = landmarks[12];
    const le = landmarks[13];
    const re = landmarks[14];
    const lh = landmarks[23];
    const rh = landmarks[24];

    if (!ls || !rs || !le || !re || !lh || !rh) {
      setMsg("角度計算に必要な点が検出できませんでした");
      return false;
    }

    const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };

    const trunkVec = {
      x: hipMid.x - shoulderMid.x,
      y: hipMid.y - shoulderMid.y,
    };

    const leftArmVec = { x: le.x - ls.x, y: le.y - ls.y };
    const rightArmVec = { x: re.x - rs.x, y: re.y - rs.y };

    const leftDeg = angleBetween(trunkVec, leftArmVec);
    const rightDeg = angleBetween(trunkVec, rightArmVec);

    if (leftDeg == null || rightDeg == null) {
      setMsg("角度計算に失敗しました");
      return false;
    }

    setAngles({ leftDeg, rightDeg });
    return true;
  }

  function estimateCroppedArea(rect) {
    const sourceCanvas = captureCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!sourceCanvas || !overlayCanvas || !landmarker) {
      setMsg("解析の準備ができていません。もう一度キャプチャしてください。");
      return;
    }

    setMsg("指定範囲を解析中…");

    const displayW = overlayCanvas.clientWidth;
    const displayH = overlayCanvas.clientHeight;

    if (!displayW || !displayH) {
      setMsg("表示サイズを取得できませんでした。もう一度キャプチャしてください。");
      return;
    }

    const scaleX = sourceCanvas.width / displayW;
    const scaleY = sourceCanvas.height / displayH;

    // 少し余白を足して切り抜く
    const marginRate = 0.12;
    const mx = rect.w * marginRate;
    const my = rect.h * marginRate;

    const sx = Math.max(0, (rect.x - mx) * scaleX);
    const sy = Math.max(0, (rect.y - my) * scaleY);
    const ex = Math.min(sourceCanvas.width, (rect.x + rect.w + mx) * scaleX);
    const ey = Math.min(sourceCanvas.height, (rect.y + rect.h + my) * scaleY);

    const sw = Math.max(1, ex - sx);
    const sh = Math.max(1, ey - sy);

    const cropCanvas = document.createElement("canvas");

    // 拡大して推定にかける
    const targetW = 900;
    const targetH = Math.max(300, Math.round((sh / sw) * targetW));

    cropCanvas.width = targetW;
    cropCanvas.height = targetH;

    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, targetW, targetH);

    const result = landmarker.detect(cropCanvas);
    const landmarks = result?.landmarks?.[0];

    if (!landmarks) {
      setMsg("指定範囲内で骨格が検出できませんでした。選手の全身を少し広めに囲ってください。");
      drawCropRect(rect);
      return;
    }

    // 切り抜き座標を元画像表示座標へ戻す
    const cropDisplayX = sx / scaleX;
    const cropDisplayY = sy / scaleY;
    const cropDisplayW = sw / scaleX;
    const cropDisplayH = sh / scaleY;

    const mappedLandmarks = landmarks.map((p) => ({
      ...p,
      x: (cropDisplayX + p.x * cropDisplayW) / displayW,
      y: (cropDisplayY + p.y * cropDisplayH) / displayH,
    }));

    setPoseLandmarks(mappedLandmarks);
    setCropMode(false);
    setDragRect(null);

    const ok = calculateAngles(mappedLandmarks);
    requestAnimationFrame(() => drawPoseOnOverlay(mappedLandmarks));

    if (ok) {
      setMsg("✅ 指定範囲から骨格を推定しました");
    }
  }

  // キャプチャ → 解析範囲指定モードへ
  const captureFrameAndEstimate = () => {
    const v = videoRef.current;
    const c = captureCanvasRef.current;

    if (!v || !c) return;

    if (!v.videoWidth || !v.videoHeight) {
      setMsg("動画の読み込み中です。少し待ってからキャプチャしてください。");
      return;
    }

    c.width = v.videoWidth;
    c.height = v.videoHeight;
    setCaptureSize({ w: c.width, h: c.height });

    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0, c.width, c.height);

    const url = c.toDataURL("image/png");
    setCapturedUrl(url);

    setAngles({ leftDeg: null, rightDeg: null });
    setPoseLandmarks(null);
    setDragRect(null);
    dragStartRef.current = null;
    setCropMode(true);

    setMsg("解析したい選手の全身を、少し余裕を持って四角で囲ってください");

    setTimeout(() => clearOverlay(), 0);
  };

  function restartCropSelection() {
    if (!capturedUrl) return;
    setAngles({ leftDeg: null, rightDeg: null });
    setPoseLandmarks(null);
    setDragRect(null);
    dragStartRef.current = null;
    setCropMode(true);
    setMsg("解析したい選手の全身を、少し余裕を持って四角で囲ってください");
    requestAnimationFrame(() => clearOverlay());
  }

  if (loading) return <div style={{ padding: 24 }}>契約確認中...</div>;

  if (authErr) return <div style={{ padding: 24, color: "crimson" }}>{authErr}</div>;

  if (!sub?.isSubscribed) {
    return (
      <div style={{ padding: 24 }}>
        <h2>有料プランが必要です</h2>
        <p>棒高跳びフォーム診断は有料会員向け機能です。</p>

        <button onClick={() => navigate("/", { replace: true })}>
          トップへ戻る
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #ccc",
            background: "white",
            cursor: "pointer",
          }}
        >
          ← ホームへ戻る
        </button>
      </div>

      <h1 style={{ marginBottom: 6 }}>棒高跳び フォーム診断</h1>
      <p style={{ marginTop: 0, marginBottom: 18 }}>
        動画をコマ送り → キャプチャ → 選手を囲う → 骨格推定
      </p>

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

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input type="file" accept="video/*" onChange={onFileChange} />
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          骨格推定: {poseReady ? "OK" : "準備中"}
        </span>
        {captureSize.w > 0 && (
          <span style={{ fontSize: 12, opacity: 0.55 }}>
            キャプチャ: {captureSize.w}×{captureSize.h}
          </span>
        )}
      </div>

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
            この瞬間をキャプチャ
          </button>

          <canvas ref={captureCanvasRef} style={{ display: "none" }} />
        </div>
      )}

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

      {capturedUrl && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>キャプチャ画像</h3>
            <button onClick={restartCropSelection} disabled={cropMode}>
              解析範囲を指定し直す
            </button>
            {cropMode && (
              <span style={{ fontSize: 12, opacity: 0.75 }}>
                画像上でドラッグして選手を囲ってください
              </span>
            )}
          </div>

          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 720,
              lineHeight: 0,
              touchAction: cropMode ? "none" : "auto",
            }}
          >
            <img
              src={capturedUrl}
              onLoad={() => {
                if (poseLandmarks) {
                  drawPoseOnOverlay(poseLandmarks);
                } else if (dragRect) {
                  drawCropRect(dragRect);
                } else {
                  clearOverlay();
                }
              }}
              alt="captured"
              style={{ width: "100%", borderRadius: 12, border: "1px solid #eee", display: "block" }}
            />
            <canvas
              ref={overlayCanvasRef}
              onMouseDown={handleCropMouseDown}
              onMouseMove={handleCropMouseMove}
              onMouseUp={handleCropMouseUp}
              onMouseLeave={handleCropMouseUp}
              onTouchStart={handleCropTouchStart}
              onTouchMove={handleCropTouchMove}
              onTouchEnd={handleCropTouchEnd}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                cursor: cropMode ? "crosshair" : "default",
                borderRadius: 12,
                pointerEvents: cropMode ? "auto" : "none",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
