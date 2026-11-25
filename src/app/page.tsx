"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  Download,
  Copy,
  Check,
  SlidersHorizontal,
  Columns2,
  SplitSquareHorizontal,
  Sparkles,
  ShieldCheck,
  Zap,
  Paintbrush,
  Undo2,
  RotateCcw,
  Plus,
  Cpu,
} from "lucide-react";
import { DropZone } from "@/components/dropzone";
import {
  AspectRatioSelector,
  AspectRatioOption,
  ASPECT_RATIO_PRESETS,
} from "@/components/aspect-ratio-selector";
import {
  BackgroundCustomizer,
  BackgroundMode,
  GradientPreset,
  GRADIENT_PRESETS,
} from "@/components/background-customizer";
import { TransformToolbar } from "@/components/transform-toolbar";
import { MaskEditorCanvas, type MaskEditorHandle } from "@/components/mask-editor";
import { ComparisonSlider } from "@/components/comparison-slider";
import { formatBytes, convertHeicToJpeg } from "@/lib/image-utils";
import type { BackendKind } from "./worker";

type Stage = "idle" | "busy" | "done" | "error";
type ExportFormat = "png" | "webp" | "jpg";
type PreviewLayout = "side-by-side" | "split";

type WorkerMsg =
  | { type: "progress"; text: string; value: number }
  | { type: "ready"; backend: BackendKind; cached: boolean }
  | {
      type: "done";
      mask: ArrayBuffer;
      width: number;
      height: number;
      backend: BackendKind;
      cached: boolean;
    }
  | { type: "error"; message: string };

function renderBackgroundToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bgMode: BackgroundMode,
  color: string,
  gradient: GradientPreset,
  blurAmount: number,
  sourceImg: HTMLImageElement | null,
  customBgImg: HTMLImageElement | null,
  forceOpaqueForJpg: boolean
) {
  if (bgMode === "transparent") {
    if (forceOpaqueForJpg) {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
    return;
  }

  if (bgMode === "color") {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (bgMode === "gradient") {
    if (gradient.kind === "radial") {
      const cx = width * (gradient.cx ?? 0.5);
      const cy = height * (gradient.cy ?? 0.5);
      const r = Math.max(width, height) * 0.75;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.stops.forEach((s) => grad.addColorStop(s.offset, s.color));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      gradient.stops.forEach((s) => grad.addColorStop(s.offset, s.color));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }
    return;
  }

  const bgImage = bgMode === "blur" ? sourceImg : customBgImg;
  if (bgImage && bgImage.naturalWidth > 0) {
    // Cover fit
    const imgRatio = bgImage.naturalWidth / bgImage.naturalHeight;
    const canvasRatio = width / height;
    let drawW = width;
    let drawH = height;
    let drawX = 0;
    let drawY = 0;

    if (imgRatio > canvasRatio) {
      drawW = height * imgRatio;
      drawX = (width - drawW) / 2;
    } else {
      drawH = width / imgRatio;
      drawY = (height - drawH) / 2;
    }

    ctx.save();
    if (bgMode === "blur") {
      ctx.filter = `blur(${blurAmount}px)`;
      // Slight overscan so blur edges stay clean
      const pad = blurAmount * 1.5;
      ctx.drawImage(bgImage, drawX - pad, drawY - pad, drawW + pad * 2, drawH + pad * 2);
    } else {
      ctx.drawImage(bgImage, drawX, drawY, drawW, drawH);
    }
    ctx.restore();
  } else if (forceOpaqueForJpg) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
  }
}

export default function XweetBgPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const maskEditorRef = useRef<MaskEditorHandle>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState({ text: "", value: 0 });
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [originalResultUrl, setOriginalResultUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });
  const [errorMsg, setErrorMsg] = useState("");
  const [runtimeInfo, setRuntimeInfo] = useState<{
    backend: BackendKind | null;
    cached: boolean;
  }>({ backend: null, cached: false });

  // Studio UI states
  const [previewLayout, setPreviewLayout] = useState<PreviewLayout>("side-by-side");
  const [showStudio, setShowStudio] = useState(true);
  const [isEditingMask, setIsEditingMask] = useState(false);
  const [isApplyingEdits, setIsApplyingEdits] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Background & Transform states
  const [bgMode, setBgMode] = useState<BackgroundMode>("transparent");
  const [selectedColor, setSelectedColor] = useState("#FFFFFF");
  const [customColor, setCustomColor] = useState("#D7F36A");
  const [selectedGradient, setSelectedGradient] = useState<GradientPreset>(GRADIENT_PRESETS[0]);
  const [blurAmount, setBlurAmount] = useState(16);
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioOption>(ASPECT_RATIO_PRESETS[0]);

  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [scale, setScale] = useState(1);
  const [flipH, setFlipH] = useState(false);
  const [dropShadow, setDropShadow] = useState(false);
  const [edgeFeather, setEdgeFeather] = useState(0);
  const [isDraggingSubject, setIsDraggingSubject] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, posX: 0, posY: 0 });

  // Boot worker on mount & pre-warm the quantized model in the background
  useEffect(() => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
      if (e.data.type === "ready") {
        setRuntimeInfo({ backend: e.data.backend, cached: true });
      }
    };
    worker.postMessage({ type: "warmup" });
    return () => {
      worker.terminate();
    };
  }, []);

  // Non-passive wheel zoom on preview box
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el || stage !== "done" || previewLayout !== "side-by-side") return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.06 : 0.94;
      setScale((prev) => Math.min(3, Math.max(0.2, Number((prev * factor).toFixed(2)))));
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [stage, previewLayout]);

  const reset = useCallback(() => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (originalResultUrl) URL.revokeObjectURL(originalResultUrl);
    if (resultUrl && resultUrl !== originalResultUrl) URL.revokeObjectURL(resultUrl);
    if (customBgUrl) URL.revokeObjectURL(customBgUrl);

    setSourceUrl(null);
    setOriginalResultUrl(null);
    setResultUrl(null);
    setCustomBgUrl(null);
    setStage("idle");
    setProgress({ text: "", value: 0 });
    setErrorMsg("");
    setBgMode("transparent");
    setSelectedColor("#FFFFFF");
    setSelectedRatio(ASPECT_RATIO_PRESETS[0]);
    setPosX(0);
    setPosY(0);
    setScale(1);
    setFlipH(false);
    setDropShadow(false);
    setEdgeFeather(0);
    setIsEditingMask(false);
    setPreviewLayout("side-by-side");
  }, [sourceUrl, originalResultUrl, resultUrl, customBgUrl]);

  const processFile = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const ACCEPTED = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp", "tiff", "avif"];
      const validType = file.type.startsWith("image/") || ACCEPTED.includes(ext);
      if (!validType) {
        setErrorMsg("Please choose a valid image (JPG, PNG, WEBP, HEIC, AVIF, GIF…).");
        setStage("error");
        return;
      }

      reset();
      setFileName(file.name);
      setFileSize(file.size);

      let processable = file;
      const isHeic =
        ext === "heic" || ext === "heif" || file.type === "image/heic" || file.type === "image/heif";

      if (isHeic) {
        setStage("busy");
        setProgress({ text: "Converting HEIC photo…", value: 6 });
        try {
          processable = await convertHeicToJpeg(file);
        } catch {
          setErrorMsg("Could not decode this HEIC file. Please export it as JPG and try again.");
          setStage("error");
          return;
        }
      }

      const src = URL.createObjectURL(processable);
      setSourceUrl(src);
      setStage("busy");
      setProgress({ text: "Starting on-device AI…", value: isHeic ? 12 : 3 });

      const worker = workerRef.current!;
      worker.onmessage = async (e: MessageEvent<WorkerMsg>) => {
        const msg = e.data;
        if (msg.type === "progress") {
          setProgress({ text: msg.text, value: msg.value });
        } else if (msg.type === "done") {
          setProgress({ text: "Done!", value: 100 });
          setRuntimeInfo({ backend: msg.backend, cached: msg.cached });

          const canvas = canvasRef.current!;
          canvas.width = msg.width;
          canvas.height = msg.height;
          setImageDims({ width: msg.width, height: msg.height });
          const ctx = canvas.getContext("2d")!;

          const bmp = await createImageBitmap(processable);
          ctx.drawImage(bmp, 0, 0, msg.width, msg.height);

          const imgData = ctx.getImageData(0, 0, msg.width, msg.height);
          const mask = new Uint8Array(msg.mask);
          for (let i = 0; i < mask.length; i++) {
            imgData.data[4 * i + 3] = mask[i];
          }
          ctx.putImageData(imgData, 0, 0);

          const blob = await new Promise<Blob>((res, rej) =>
            canvas.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), "image/png")
          );
          const url = URL.createObjectURL(blob);
          setOriginalResultUrl(url);
          setResultUrl(url);
          setTimeout(() => setStage("done"), 250);
        } else if (msg.type === "error") {
          setErrorMsg(msg.message);
          setStage("error");
        }
      };

      worker.onerror = (err) => {
        setErrorMsg(err.message || "Worker execution error.");
        setStage("error");
      };

      const buf = await processable.arrayBuffer();
      worker.postMessage({ type: "process", imageBuffer: buf }, [buf]);
    },
    [reset]
  );

  // Global Ctrl+V / Cmd+V paste support
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (stage === "busy") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            processFile(
              new File([file], `pasted-${Date.now()}.png`, { type: file.type || "image/png" })
            );
            break;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [stage, processFile]);

  const loadImageElement = (url: string | null): Promise<HTMLImageElement | null> => {
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  };

  const getExportBlob = async (format: ExportFormat = exportFormat): Promise<Blob | null> => {
    const rawCanvas = canvasRef.current;
    if (!rawCanvas || imageDims.width === 0) return null;

    let targetWidth = imageDims.width;
    let targetHeight = imageDims.height;

    if (selectedRatio.ratio !== "original") {
      const targetR = selectedRatio.ratio;
      if (targetR >= 1) {
        targetWidth = Math.max(imageDims.width, Math.round(imageDims.height * targetR));
        targetHeight = Math.round(targetWidth / targetR);
      } else {
        targetHeight = Math.max(imageDims.height, Math.round(imageDims.width / targetR));
        targetWidth = Math.round(targetHeight * targetR);
      }
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;
    const exportCtx = exportCanvas.getContext("2d")!;

    const [srcImg, customBgImg] = await Promise.all([
      bgMode === "blur" ? loadImageElement(sourceUrl) : Promise.resolve(null),
      bgMode === "image" ? loadImageElement(customBgUrl) : Promise.resolve(null),
    ]);

    renderBackgroundToCanvas(
      exportCtx,
      targetWidth,
      targetHeight,
      bgMode,
      selectedColor,
      selectedGradient,
      blurAmount,
      srcImg,
      customBgImg,
      format === "jpg"
    );

    const previewEl = previewBoxRef.current;
    const previewRect = previewEl ? previewEl.getBoundingClientRect() : null;
    const fitPreviewScale = previewRect
      ? Math.min(previewRect.width / imageDims.width, previewRect.height / imageDims.height)
      : 1;
    const fittedPreviewW = Math.max(1, imageDims.width * fitPreviewScale);
    const fittedPreviewH = Math.max(1, imageDims.height * fitPreviewScale);

    const fitExportScale = Math.min(targetWidth / imageDims.width, targetHeight / imageDims.height);
    const fittedExportW = imageDims.width * fitExportScale;
    const fittedExportH = imageDims.height * fitExportScale;

    const exportOffsetX = (posX / fittedPreviewW) * fittedExportW;
    const exportOffsetY = (posY / fittedPreviewH) * fittedExportH;

    exportCtx.save();
    exportCtx.translate(targetWidth / 2 + exportOffsetX, targetHeight / 2 + exportOffsetY);
    exportCtx.scale(scale * (flipH ? -1 : 1), scale);

    if (dropShadow) {
      exportCtx.shadowColor = "rgba(23, 24, 21, 0.35)";
      exportCtx.shadowBlur = Math.max(14, Math.round(targetWidth * 0.025));
      exportCtx.shadowOffsetY = Math.max(8, Math.round(targetHeight * 0.014));
    }

    if (edgeFeather > 0) {
      exportCtx.filter = `blur(${edgeFeather * 0.6}px)`;
    }

    exportCtx.drawImage(
      rawCanvas,
      -fittedExportW / 2,
      -fittedExportH / 2,
      fittedExportW,
      fittedExportH
    );
    exportCtx.restore();

    const mime =
      format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
    const quality = format === "png" ? undefined : 0.92;

    return new Promise<Blob>((resolve, reject) => {
      exportCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to export image"))),
        mime,
        quality
      );
    });
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const blob = await getExportBlob(exportFormat);
      if (!blob) return;
      const base = (fileName || "xweet-bg").replace(/\.[^.]+$/, "");
      const ratioTag = selectedRatio.id.replace(":", "-");
      const suffix =
        bgMode === "transparent" && selectedRatio.id === "original"
          ? "xweet-bg"
          : `${ratioTag}-${bgMode}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}-${suffix}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyClipboard = async () => {
    try {
      const blob = await getExportBlob("png");
      if (!blob || !navigator.clipboard?.write) return;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: ignore if browser blocks clipboard write
    }
  };

  const handleCustomBgUpload = (file: File) => {
    if (customBgUrl) URL.revokeObjectURL(customBgUrl);
    setCustomBgUrl(URL.createObjectURL(file));
    setBgMode("image");
  };

  const snapBottom = () => {
    const el = previewBoxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosX(0);
    setPosY(Math.round(rect.height * 0.12));
  };

  const resetTransform = () => {
    setPosX(0);
    setPosY(0);
    setScale(1);
    setFlipH(false);
    setDropShadow(false);
    setEdgeFeather(0);
  };

  const restoreOriginalCutout = () => {
    if (!originalResultUrl) return;
    if (resultUrl && resultUrl !== originalResultUrl) {
      URL.revokeObjectURL(resultUrl);
    }
    setResultUrl(originalResultUrl);
    const img = new window.Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = originalResultUrl;
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper text-carbon">
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-[#E4E2D7] bg-paper/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-clear.png"
              alt="xweet bg"
              className="h-7 w-7 rounded-lg object-contain"
            />
            <span className="font-space font-bold text-base tracking-tight text-carbon">
              xweet <span className="px-1.5 py-0.5 rounded-md bg-signal-lime text-carbon text-xs font-mono">bg</span>
            </span>
          </button>

          <div className="flex items-center gap-2.5">
            {runtimeInfo.backend && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#E4E2D7] bg-white px-2.5 py-1 text-[11px] font-mono text-carbon">
                <Cpu className="h-3 w-3 text-emerald-600" />
                {runtimeInfo.backend === "webgpu" ? "WebGPU" : "WASM"}
                {runtimeInfo.cached ? " · Cached" : ""}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E4E2D7] bg-white px-3 py-1 text-[11px] font-semibold text-carbon">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              100% On-Device
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Workspace ─────────────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col">
        {/* IDLE */}
        {stage === "idle" && (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-8 py-6"
            style={{ animation: "fade-in-up 0.35s ease-out" }}
          >
            <div className="text-center max-w-2xl space-y-3">
              
              <h1 className="font-space text-3xl sm:text-5xl font-bold tracking-tight text-carbon leading-[1.1]">
                Remove backgrounds{" "}
                <span className="underline decoration-signal-lime decoration-4 underline-offset-4">
                  on your device
                </span>
                .
              </h1>
              <p className="text-sm sm:text-base text-terrain max-w-lg mx-auto">
                Instant studio cutouts powered by local browser AI. Zero uploads, zero watermarks, zero signups.
              </p>
            </div>

            <div className="w-full max-w-xl">
              <DropZone onFileSelected={processFile} />
            </div>

            {/* Live Before / After Preview */}
            <div className="w-full max-w-xl space-y-2.5">
              <div className="flex items-center justify-between px-1 text-xs">
                <span className="font-semibold text-carbon">Preview Result</span>
                <span className="text-terrain">Drag slider to compare</span>
              </div>
              <div className="rounded-3xl border border-[#E4E2D7] bg-white p-2.5 shadow-xs">
                <div className="w-full aspect-[960/691] rounded-2xl overflow-hidden">
                  <ComparisonSlider
                    beforeUrl="/sample-before.jpg"
                    afterUrl="/sample-after.png"
                    aspectStyle="960 / 691"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BUSY */}
        {stage === "busy" && (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-8 py-14"
            style={{ animation: "fade-in-up 0.3s ease-out" }}
          >
            {sourceUrl && (
              <div className="relative h-44 w-44 rounded-3xl overflow-hidden border border-[#E4E2D7] bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sourceUrl}
                  alt="Processing"
                  className="w-full h-full object-cover scale-110 blur-sm opacity-45"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    animation: "pulse-ring 1.8s ease-in-out infinite",
                    background:
                      "radial-gradient(circle, rgba(215,243,106,0.35) 0%, transparent 70%)",
                  }}
                />
              </div>
            )}

            <div className="w-full max-w-sm space-y-2.5 text-center">
              <p className="font-space text-lg font-bold text-carbon">{progress.text || "Processing…"}</p>
              <div className="h-2.5 w-full rounded-full bg-[#E4E2D7] overflow-hidden">
                <div
                  className="h-full bg-carbon transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(4, progress.value)}%` }}
                />
              </div>
              <p className="text-xs text-terrain font-mono">
                {progress.value}% · Runs locally in your browser
              </p>
            </div>
          </div>
        )}

        {/* ERROR */}
        {stage === "error" && (
          <div className="flex-1 flex items-center justify-center py-14">
            <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 space-y-4">
              <div>
                <p className="text-sm font-bold text-red-900">Could not process image</p>
                <p className="text-xs text-red-700 mt-1">{errorMsg}</p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="rounded-xl bg-carbon px-4 py-2 text-xs font-semibold text-paper hover:opacity-90 cursor-pointer"
              >
                Try another image
              </button>
            </div>
          </div>
        )}

        {/* DONE */}
        {stage === "done" && sourceUrl && resultUrl && (
          <div className="space-y-6" style={{ animation: "fade-in-up 0.35s ease-out" }}>
            {/* Top Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E4E2D7] bg-white p-3.5 sm:px-5">
              <div className="flex items-center gap-2 text-xs min-w-0">
                <span className="font-semibold text-carbon truncate max-w-[160px]">{fileName}</span>
                <span className="text-[#D6D4C9]">·</span>
                <span className="font-mono text-terrain">{formatBytes(fileSize)}</span>
                <span className="text-[#D6D4C9] hidden sm:inline">·</span>
                <span className="font-mono text-terrain hidden sm:inline">
                  {imageDims.width}×{imageDims.height}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* View Toggle */}
                <div className="inline-flex rounded-xl border border-[#E4E2D7] bg-paper p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewLayout("side-by-side")}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      previewLayout === "side-by-side"
                        ? "bg-white text-carbon shadow-2xs"
                        : "text-terrain hover:text-carbon"
                    }`}
                  >
                    <Columns2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Studio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewLayout("split")}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      previewLayout === "split"
                        ? "bg-white text-carbon shadow-2xs"
                        : "text-terrain hover:text-carbon"
                    }`}
                  >
                    <SplitSquareHorizontal className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Compare</span>
                  </button>
                </div>

                {/* Copy PNG */}
                <button
                  type="button"
                  onClick={handleCopyClipboard}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-white px-3 py-2 text-xs font-semibold text-carbon hover:bg-paper cursor-pointer"
                  title="Copy cutout PNG to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Copy</span>
                    </>
                  )}
                </button>

                {/* Format Picker */}
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                  className="rounded-xl border border-[#E4E2D7] bg-paper px-2.5 py-2 text-xs font-mono font-semibold text-carbon cursor-pointer"
                  aria-label="Export format"
                >
                  <option value="png">PNG</option>
                  <option value="webp">WEBP</option>
                  <option value="jpg">JPG</option>
                </select>

                {/* Download */}
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-carbon px-4 py-2 text-xs font-bold text-signal-lime hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{isDownloading ? "Exporting…" : `Download ${exportFormat.toUpperCase()}`}</span>
                </button>

                {/* New Image */}
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#E4E2D7] bg-white px-3 py-2 text-xs font-semibold text-carbon hover:bg-paper cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">New</span>
                </button>
              </div>
            </div>

            {/* Preview Area */}
            {previewLayout === "split" ? (
              <div className="rounded-3xl border border-[#E4E2D7] bg-white p-4 flex items-center justify-center h-[420px] sm:h-[500px]">
                <ComparisonSlider
                  beforeUrl={sourceUrl}
                  afterUrl={resultUrl}
                  aspectStyle={
                    imageDims.width && imageDims.height
                      ? `${imageDims.width} / ${imageDims.height}`
                      : undefined
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Original */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-terrain">
                    Original
                  </p>
                  <div className="rounded-3xl border border-[#E4E2D7] bg-white flex items-center justify-center p-3 h-[360px] sm:h-[440px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sourceUrl}
                      alt="Original"
                      className="w-full h-full object-contain select-none pointer-events-none"
                    />
                  </div>
                </div>

                {/* Live Studio Result */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-terrain">
                      Result · {selectedRatio.name}
                    </p>
                    <span className="text-[11px] text-terrain">Drag to move · Scroll to zoom</span>
                  </div>

                  <div className="rounded-3xl border border-[#E4E2D7] bg-white flex items-center justify-center p-3 h-[360px] sm:h-[440px] overflow-hidden">
                    <div
                      ref={previewBoxRef}
                      onPointerDown={(e) => {
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setIsDraggingSubject(true);
                        setDragStart({ x: e.clientX, y: e.clientY, posX, posY });
                      }}
                      onPointerMove={(e) => {
                        if (!isDraggingSubject) return;
                        setPosX(dragStart.posX + (e.clientX - dragStart.x));
                        setPosY(dragStart.posY + (e.clientY - dragStart.y));
                      }}
                      onPointerUp={(e) => {
                        setIsDraggingSubject(false);
                        try {
                          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                        } catch {
                          // noop
                        }
                      }}
                      className={`relative rounded-2xl overflow-hidden select-none touch-none flex items-center justify-center ${
                        isDraggingSubject ? "cursor-grabbing ring-2 ring-carbon" : "cursor-grab"
                      }`}
                      style={{
                        aspectRatio:
                          selectedRatio.ratio === "original"
                            ? imageDims.width && imageDims.height
                              ? `${imageDims.width} / ${imageDims.height}`
                              : undefined
                            : selectedRatio.cssAspect,
                        width: selectedRatio.ratio === "original" ? "100%" : undefined,
                        height: selectedRatio.ratio === "original" ? "100%" : undefined,
                        maxWidth: "100%",
                        maxHeight: "100%",
                        background:
                          bgMode === "color"
                            ? selectedColor
                            : bgMode === "gradient"
                            ? selectedGradient.css
                            : undefined,
                      }}
                    >
                      {/* Transparent Checkerboard */}
                      {bgMode === "transparent" && (
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            backgroundImage:
                              "repeating-conic-gradient(#E5E5DF 0% 25%, #F6F6F2 0% 50%)",
                            backgroundSize: "16px 16px",
                          }}
                        />
                      )}

                      {/* Blurred Original or Custom Photo Background */}
                      {(bgMode === "blur" || (bgMode === "image" && customBgUrl)) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={bgMode === "blur" ? sourceUrl : customBgUrl!}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                          style={
                            bgMode === "blur"
                              ? { filter: `blur(${blurAmount}px)`, transform: "scale(1.1)" }
                              : undefined
                          }
                        />
                      )}

                      {/* Subject Cutout */}
                      <div
                        className="relative w-full h-full flex items-center justify-center pointer-events-none z-10"
                        style={{
                          transform: `translate(${posX}px, ${posY}px) scale(${scale}) scaleX(${
                            flipH ? -1 : 1
                          })`,
                          transition: isDraggingSubject ? "none" : "transform 0.12s ease-out",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resultUrl}
                          alt="Cutout"
                          className="w-full h-full object-contain p-2"
                          style={{
                            filter: [
                              dropShadow ? "drop-shadow(0 12px 18px rgba(23,24,21,0.35))" : "",
                              edgeFeather > 0 ? `blur(${edgeFeather * 0.45}px)` : "",
                            ]
                              .filter(Boolean)
                              .join(" "),
                          }}
                          draggable={false}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Studio Controls Toggle */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowStudio((s) => !s)}
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-carbon hover:opacity-75 cursor-pointer"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {showStudio ? "Hide Studio Controls" : "Show Studio Controls"}
              </button>
            </div>

            {showStudio && (
              <div className="space-y-4">
                <BackgroundCustomizer
                  bgMode={bgMode}
                  onBgModeChange={setBgMode}
                  selectedColor={selectedColor}
                  onColorChange={(col) => {
                    setSelectedColor(col);
                    setBgMode("color");
                  }}
                  customColor={customColor}
                  onCustomColorChange={(col) => {
                    setCustomColor(col);
                    setSelectedColor(col);
                    setBgMode("color");
                  }}
                  selectedGradient={selectedGradient}
                  onGradientChange={(grad) => {
                    setSelectedGradient(grad);
                    setBgMode("gradient");
                  }}
                  blurAmount={blurAmount}
                  onBlurAmountChange={setBlurAmount}
                  customBgUrl={customBgUrl}
                  onCustomBgUpload={handleCustomBgUpload}
                />

                <AspectRatioSelector
                  selectedRatio={selectedRatio}
                  onSelectRatio={setSelectedRatio}
                />

                <TransformToolbar
                  scale={scale}
                  onScaleChange={setScale}
                  flipH={flipH}
                  onToggleFlip={() => setFlipH((f) => !f)}
                  onSnapBottom={snapBottom}
                  onReset={resetTransform}
                  hasTransformChanges={
                    posX !== 0 || posY !== 0 || scale !== 1 || flipH || dropShadow || edgeFeather > 0
                  }
                  dropShadow={dropShadow}
                  onToggleShadow={() => setDropShadow((d) => !d)}
                  edgeFeather={edgeFeather}
                  onEdgeFeatherChange={setEdgeFeather}
                />

                {/* Manual Touch-Up Drawer */}
                <div className="rounded-2xl border border-[#E4E2D7] bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsEditingMask((p) => !p)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-paper/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-paper border border-[#E4E2D7] flex items-center justify-center text-carbon">
                        <Paintbrush className="h-4 w-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold uppercase tracking-wider text-carbon">
                          Manual Touch-Up
                        </p>
                        <p className="text-[11px] text-terrain">
                          Erase leftover spots or restore missing edges
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-terrain">
                      {isEditingMask ? "Close" : "Open"}
                    </span>
                  </button>

                  {isEditingMask && (
                    <div className="px-5 pb-5 space-y-3 border-t border-[#F0EFE6] pt-4">
                      <MaskEditorCanvas
                        ref={maskEditorRef}
                        resultUrl={resultUrl}
                        sourceUrl={sourceUrl}
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isApplyingEdits}
                          onClick={async () => {
                            if (!maskEditorRef.current) return;
                            setIsApplyingEdits(true);
                            try {
                              const blob = await maskEditorRef.current.exportPng();
                              if (!blob) return;
                              const newUrl = URL.createObjectURL(blob);
                              if (resultUrl !== originalResultUrl) {
                                URL.revokeObjectURL(resultUrl);
                              }
                              const img = new window.Image();
                              img.onload = () => {
                                const canvas = canvasRef.current;
                                if (!canvas) return;
                                canvas.width = img.naturalWidth;
                                canvas.height = img.naturalHeight;
                                const ctx = canvas.getContext("2d")!;
                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, 0, 0);
                                setResultUrl(newUrl);
                              };
                              img.src = newUrl;
                            } finally {
                              setIsApplyingEdits(false);
                            }
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-carbon px-4 py-2.5 text-xs font-bold text-signal-lime hover:opacity-90 disabled:opacity-50 cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {isApplyingEdits ? "Applying…" : "Apply Edits"}
                        </button>

                        <button
                          type="button"
                          onClick={() => maskEditorRef.current?.undo()}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-white px-4 py-2.5 text-xs font-semibold text-carbon hover:bg-paper cursor-pointer"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          Undo
                        </button>

                        {resultUrl !== originalResultUrl && (
                          <button
                            type="button"
                            onClick={restoreOriginalCutout}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-white px-3.5 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Reset AI Cutout
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Below-the-Fold Trust & SEO Section ──────────────────────────── */}
        <section className="mt-16 pt-12 border-t border-[#E4E2D7] space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[#E4E2D7] bg-white/80 p-5 space-y-2">
              <ShieldCheck className="h-5 w-5 text-carbon" />
              <h2 className="font-space font-bold text-sm text-carbon">Zero Server Uploads</h2>
              <p className="text-xs text-terrain leading-relaxed">
                Your photos never leave your device. The AI segmentation model runs locally in your browser sandbox.
              </p>
            </div>
            <div className="rounded-2xl border border-[#E4E2D7] bg-white/80 p-5 space-y-2">
              <Zap className="h-5 w-5 text-carbon" />
              <h2 className="font-space font-bold text-sm text-carbon">WebGPU & WASM Speed</h2>
              <p className="text-xs text-terrain leading-relaxed">
                Automatically accelerates on your GPU via WebGPU when supported, with seamless WebAssembly fallback.
              </p>
            </div>
            <div className="rounded-2xl border border-[#E4E2D7] bg-white/80 p-5 space-y-2">
              <Sparkles className="h-5 w-5 text-carbon" />
              <h2 className="font-space font-bold text-sm text-carbon">Full-Res, No Watermark</h2>
              <p className="text-xs text-terrain leading-relaxed">
                Export crisp PNG, WEBP, or JPG images with custom backdrops, studio shadows, and social aspect ratios.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E4E2D7] bg-white/60 p-6 space-y-4">
            <h2 className="font-space font-bold text-base text-carbon">Frequently Asked Questions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
              <div className="space-y-1">
                <p className="font-semibold text-carbon">Why does the first image take a few seconds?</p>
                <p className="text-terrain leading-relaxed">
                  Your browser downloads the open-source AI model once and caches it locally. Every image after that is near-instant.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-carbon">Are there any daily limits or paywalls?</p>
                <p className="text-terrain leading-relaxed">
                  None. Since all processing happens on your own hardware, xweet bg is 100% free with unlimited exports.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-carbon">Does it work with iPhone HEIC photos?</p>
                <p className="text-terrain leading-relaxed">
                  Yes. HEIC and HEIF files are decoded right in your browser alongside JPG, PNG, WEBP, and AVIF.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E4E2D7] py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-terrain">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.png" alt="xweet" className="h-4 w-4 rounded-xs" />
            <span className="font-semibold text-carbon">xweet bg</span>
            <span>·</span>
            <span>bg.xweet.in</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://xweet.in" target="_blank" rel="noreferrer" className="hover:text-carbon">
              xweet.in
            </a>
            <span>100% Client-Side AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
