"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Copy,
  Check,
  SlidersHorizontal,
  Columns2,
  SplitSquareHorizontal,
  Sparkles,
  Paintbrush,
  Undo2,
  RotateCcw,
  Plus,
  Share2,
  Eye,
  FlipHorizontal2,
  ArrowDownToLine,
  ImagePlus,
  IdCard,
  ShoppingBag,
  UserCircle2,
  Crop,
  X,
} from "lucide-react";
import { DropZone } from "@/components/dropzone";
import {
  ASPECT_RATIO_PRESETS,
  type AspectRatioOption,
} from "@/components/aspect-ratio-selector";
import {
  GRADIENT_PRESETS,
  SOLID_COLOR_PRESETS,
  type BackgroundMode,
  type GradientPreset,
} from "@/components/background-customizer";
import { type StudioPresetId } from "@/components/transform-toolbar";
import { MaskEditorCanvas, type MaskEditorHandle } from "@/components/mask-editor";
import { ComparisonSlider } from "@/components/comparison-slider";
import { AppHeader } from "@/components/app-header";
import { useStudio } from "@/components/studio-provider";
import {
  defringeCanvas,
  formatBytes,
  trimCanvasToSubject,
} from "@/lib/image-utils";

type ExportFormat = "png" | "webp" | "jpg";
type PreviewLayout = "split" | "side-by-side";
type StudioTab = "backdrop" | "frame" | "polish" | "brush";

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

export function CutoutStudio() {
  const router = useRouter();
  const {
    canvasRef,
    stage,
    progress,
    sourceUrl,
    originalResultUrl,
    resultUrl,
    fileName,
    fileSize,
    imageDims,
    errorMsg,
    maxResolution,
    setMaxResolution,
    setPassportBgColor,
    processFile,
    reset: resetShared,
    applyMaskEditUrl,
    restoreOriginalCutout,
  } = useStudio();

  const previewOuterRef = useRef<HTMLDivElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const maskEditorRef = useRef<MaskEditorHandle>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  const [previewLayout, setPreviewLayout] = useState<PreviewLayout>("split");
  const [showStudio, setShowStudio] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>("backdrop");
  const [peekOriginal, setPeekOriginal] = useState(false);
  const [isApplyingEdits, setIsApplyingEdits] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [urlPreset, setUrlPreset] = useState<StudioPresetId | null>(null);

  // Measure outer preview box so aspect frame fits tightly without stretching checkerboard
  const [outerSize, setOuterSize] = useState({ w: 0, h: 0 });

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
  const [defringe, setDefringe] = useState(false);
  const [trimSubject, setTrimSubject] = useState(false);
  const [trimPadding, setTrimPadding] = useState(16);
  const [avatarCircleGuide, setAvatarCircleGuide] = useState(false);
  const [isDraggingSubject, setIsDraggingSubject] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, posX: 0, posY: 0 });

  const canShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  );

  // Redirect legacy ?mode=passport or ?preset=passport URLs to /passport SEO route
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const p = params.get("preset");
    const m = params.get("mode");
    if (m === "passport" || p === "passport") {
      router.replace("/passport");
    } else if (p === "product" || p === "avatar") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrlPreset(p);
    }
  }, [router]);

  const resetLocalState = useCallback(() => {
    if (customBgUrl) URL.revokeObjectURL(customBgUrl);
    setCustomBgUrl(null);
    setBgMode("transparent");
    setSelectedColor("#FFFFFF");
    setSelectedRatio(ASPECT_RATIO_PRESETS[0]);
    setPosX(0);
    setPosY(0);
    setScale(1);
    setFlipH(false);
    setDropShadow(false);
    setEdgeFeather(0);
    setDefringe(false);
    setTrimSubject(false);
    setTrimPadding(16);
    setAvatarCircleGuide(false);
    setEstimatedSize(null);
    setShowStudio(false);
    setStudioTab("backdrop");
    setPeekOriginal(false);
    setPreviewLayout("split");
  }, [customBgUrl]);

  const handleFullReset = useCallback(() => {
    resetLocalState();
    resetShared();
  }, [resetLocalState, resetShared]);

  const applyPreset = useCallback((preset: StudioPresetId, passportColor = "#FFFFFF") => {
    setPosX(0);
    setPosY(0);
    setScale(1);
    setFlipH(false);
    setShowStudio(true);
    setPreviewLayout("side-by-side");
    if (preset === "product") {
      setSelectedRatio(ASPECT_RATIO_PRESETS.find((r) => r.id === "1:1") ?? ASPECT_RATIO_PRESETS[0]);
      setBgMode("color");
      setSelectedColor("#FFFFFF");
      setDropShadow(true);
      setTrimSubject(true);
      setAvatarCircleGuide(false);
    } else if (preset === "avatar") {
      setSelectedRatio(ASPECT_RATIO_PRESETS.find((r) => r.id === "1:1") ?? ASPECT_RATIO_PRESETS[0]);
      setBgMode("color");
      setSelectedColor("#F0EFE6");
      setDropShadow(false);
      setTrimSubject(false);
      setAvatarCircleGuide(true);
    } else if (preset === "passport") {
      setSelectedRatio(ASPECT_RATIO_PRESETS.find((r) => r.id === "4:5") ?? ASPECT_RATIO_PRESETS[0]);
      setBgMode("color");
      setSelectedColor(passportColor);
      setDropShadow(false);
      setTrimSubject(true);
      setAvatarCircleGuide(false);
    }
  }, []);

  // Apply URL preset once result becomes ready
  const appliedUrlPresetRef = useRef<string | null>(null);
  useEffect(() => {
    if (stage === "done" && resultUrl && urlPreset && appliedUrlPresetRef.current !== resultUrl) {
      appliedUrlPresetRef.current = resultUrl;
      applyPreset(urlPreset);
    }
  }, [stage, resultUrl, urlPreset, applyPreset]);

  // Observe outer preview container size so aspect box stays exact
  useEffect(() => {
    const el = previewOuterRef.current;
    if (!el || stage !== "done") return;
    const update = () => {
      setOuterSize({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stage, showStudio, previewLayout, studioTab]);

  // Non-passive wheel zoom on live studio canvas
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el || stage !== "done") return;
    if (!showStudio && previewLayout !== "side-by-side") return;
    if (showStudio && studioTab === "brush") return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.06 : 0.94;
      setScale((prev) => Math.min(3, Math.max(0.2, Number((prev * factor).toFixed(2)))));
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [stage, showStudio, previewLayout, studioTab]);

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

    let subjectCanvas: HTMLCanvasElement = rawCanvas;
    if (defringe) {
      subjectCanvas = defringeCanvas(subjectCanvas);
    }
    if (trimSubject) {
      subjectCanvas = trimCanvasToSubject(subjectCanvas, trimPadding);
    }

    const subjW = subjectCanvas.width;
    const subjH = subjectCanvas.height;
    let targetWidth = subjW;
    let targetHeight = subjH;

    if (selectedRatio.ratio !== "original") {
      const targetR = selectedRatio.ratio;
      if (targetR >= 1) {
        targetWidth = Math.max(subjW, Math.round(subjH * targetR));
        targetHeight = Math.round(targetWidth / targetR);
      } else {
        targetHeight = Math.max(subjH, Math.round(subjW / targetR));
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
      ? Math.min(previewRect.width / subjW, previewRect.height / subjH)
      : 1;
    const fittedPreviewW = Math.max(1, subjW * fitPreviewScale);
    const fittedPreviewH = Math.max(1, subjH * fitPreviewScale);

    const fitExportScale = Math.min(targetWidth / subjW, targetHeight / subjH);
    const fittedExportW = subjW * fitExportScale;
    const fittedExportH = subjH * fitExportScale;

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
      subjectCanvas,
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

  // Live export size estimate
  useEffect(() => {
    if (stage !== "done") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const blob = await getExportBlob(exportFormat);
        if (!cancelled && blob) setEstimatedSize(blob.size);
      } catch {
        // noop
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stage,
    exportFormat,
    bgMode,
    selectedColor,
    selectedGradient,
    blurAmount,
    customBgUrl,
    selectedRatio,
    defringe,
    trimSubject,
    trimPadding,
    dropShadow,
    edgeFeather,
    scale,
    flipH,
    resultUrl,
  ]);

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
      // noop
    }
  };

  const handleShare = async () => {
    try {
      const blob = await getExportBlob(exportFormat);
      if (!blob || !navigator.share) return;
      const base = (fileName || "xweet-bg").replace(/\.[^.]+$/, "");
      const file = new File([blob], `${base}-xweet-bg.${exportFormat}`, { type: blob.type });
      await navigator.share({ title: "xweet bg cutout", files: [file] });
    } catch {
      // noop
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
    setDefringe(false);
    setTrimSubject(false);
    setAvatarCircleGuide(false);
  };

  // Compute exact fitted dimensions for live result preview box
  const targetAspectRatio =
    selectedRatio.ratio === "original"
      ? imageDims.width && imageDims.height
        ? imageDims.width / imageDims.height
        : 1
      : selectedRatio.ratio;

  const fittedPreviewDims = (() => {
    const pad = 16;
    const availW = Math.max(120, outerSize.w - pad);
    const availH = Math.max(120, outerSize.h - pad);
    if (outerSize.w === 0 || outerSize.h === 0) {
      return { width: "100%", height: "100%" };
    }
    if (availW / availH > targetAspectRatio) {
      return { width: `${Math.round(availH * targetAspectRatio)}px`, height: `${availH}px` };
    }
    return { width: `${availW}px`, height: `${Math.round(availW / targetAspectRatio)}px` };
  })();

  const hasTransformChanges =
    posX !== 0 ||
    posY !== 0 ||
    scale !== 1 ||
    flipH ||
    dropShadow ||
    edgeFeather > 0 ||
    defringe ||
    trimSubject;

  const renderLiveCanvasBox = () => (
    <div
      ref={previewOuterRef}
      className="relative w-full h-full flex items-center justify-center p-2 overflow-hidden"
    >
      {peekOriginal && sourceUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sourceUrl}
          alt="Original preview"
          className="max-w-full max-h-full object-contain rounded-xl select-none pointer-events-none"
        />
      ) : (
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
          className={`relative rounded-xl overflow-hidden select-none touch-none flex items-center justify-center ring-1 ring-black/8 ${
            isDraggingSubject ? "cursor-grabbing ring-2 ring-carbon" : "cursor-grab"
          }`}
          style={{
            width: fittedPreviewDims.width,
            height: fittedPreviewDims.height,
            background:
              bgMode === "color"
                ? selectedColor
                : bgMode === "gradient"
                ? selectedGradient.css
                : undefined,
          }}
        >
          {bgMode === "transparent" && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "repeating-conic-gradient(#E5E5DF 0% 25%, #F6F6F2 0% 50%)",
                backgroundSize: "16px 16px",
              }}
            />
          )}

          {(bgMode === "blur" || (bgMode === "image" && customBgUrl)) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bgMode === "blur" ? sourceUrl! : customBgUrl!}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={
                bgMode === "blur"
                  ? { filter: `blur(${blurAmount}px)`, transform: "scale(1.1)" }
                  : undefined
              }
            />
          )}

          {avatarCircleGuide && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div className="h-[88%] w-[88%] rounded-full border-2 border-dashed border-carbon/50 shadow-[0_0_0_999px_rgba(23,24,21,0.12)]" />
            </div>
          )}

          <div
            className="relative w-full h-full flex items-center justify-center pointer-events-none z-10"
            style={{
              transform: `translate(${posX}px, ${posY}px) scale(${scale}) scaleX(${flipH ? -1 : 1})`,
              transition: isDraggingSubject ? "none" : "transform 0.12s ease-out",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resultUrl!}
              alt="Cutout"
              className="w-full h-full object-contain p-1.5"
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
      )}
    </div>
  );

  return (
    <>
      <AppHeader onResetCurrent={resetLocalState} />

      {/* IDLE */}
      {stage === "idle" && (
        <div
          className="flex-1 flex flex-col items-center justify-start gap-5 pt-1"
          style={{ animation: "fade-in-up 0.35s ease-out" }}
        >
          <div className="text-center max-w-2xl space-y-2">
            {urlPreset && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-signal-lime/70 border border-carbon/15 px-3 py-1 text-xs font-semibold text-carbon capitalize">
                <Sparkles className="h-3.5 w-3.5" />
                {urlPreset} preset active
              </div>
            )}
            <h1 className="font-space text-3xl sm:text-5xl font-bold tracking-tight text-carbon leading-[1.08]">
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

          <div className="w-full max-w-xl space-y-2">
            <DropZone onFileSelected={processFile} />
            <div className="flex items-center justify-between px-1 text-[11px] text-terrain">
              <span>Max Resolution</span>
              <div className="inline-flex rounded-full border border-[#E4E2D7] bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setMaxResolution(2048)}
                  className={`px-2.5 py-0.5 rounded-full font-semibold transition-colors cursor-pointer ${
                    maxResolution === 2048
                      ? "bg-carbon text-signal-lime"
                      : "text-terrain hover:text-carbon"
                  }`}
                >
                  2048px Fast
                </button>
                <button
                  type="button"
                  onClick={() => setMaxResolution(0)}
                  className={`px-2.5 py-0.5 rounded-full font-semibold transition-colors cursor-pointer ${
                    maxResolution === 0
                      ? "bg-carbon text-signal-lime"
                      : "text-terrain hover:text-carbon"
                  }`}
                >
                  Original
                </button>
              </div>
            </div>
          </div>

          <div className="w-full max-w-lg space-y-1.5">
            <div className="flex items-center justify-between px-1 text-[11px]">
              <span className="font-semibold text-carbon">Preview Result</span>
              <span className="text-terrain">Drag slider to compare</span>
            </div>
            <div className="rounded-2xl border border-[#E4E2D7] bg-white p-2 shadow-xs">
              <div className="w-full aspect-[960/691] rounded-xl overflow-hidden">
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
          className="flex-1 flex flex-col items-center justify-center gap-7 py-12"
          style={{ animation: "fade-in-up 0.3s ease-out" }}
        >
          {sourceUrl && (
            <div className="relative h-40 w-40 rounded-3xl overflow-hidden border border-[#E4E2D7] bg-white shadow-sm">
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
                  background: "radial-gradient(circle, rgba(215,243,106,0.35) 0%, transparent 70%)",
                }}
              />
            </div>
          )}

          <div className="w-full max-w-sm space-y-2.5 text-center">
            <p className="font-space text-lg font-bold text-carbon">
              {progress.text || "Processing…"}
            </p>
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
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 space-y-4">
            <div>
              <p className="text-sm font-bold text-red-900">Could not process image</p>
              <p className="text-xs text-red-700 mt-1">{errorMsg}</p>
            </div>
            <button
              type="button"
              onClick={handleFullReset}
              className="rounded-xl bg-carbon px-4 py-2 text-xs font-semibold text-paper hover:opacity-90 cursor-pointer"
            >
              Try another image
            </button>
          </div>
        </div>
      )}

      {/* DONE — FITS WITHIN ONE LAPTOP VIEWPORT */}
      {stage === "done" && sourceUrl && resultUrl && (
        <div className="space-y-3" style={{ animation: "fade-in-up 0.3s ease-out" }}>
          {/* Compact Top Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E4E2D7] bg-white px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-xs min-w-0">
              <span className="font-semibold text-carbon truncate max-w-[140px]">{fileName}</span>
              <span className="text-[#D6D4C9]">·</span>
              <span className="font-mono text-terrain">{formatBytes(fileSize)}</span>
              <span className="text-[#D6D4C9] hidden sm:inline">·</span>
              <span className="font-mono text-terrain hidden sm:inline">
                {imageDims.width}×{imageDims.height}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {!showStudio && (
                <div className="inline-flex rounded-xl border border-[#E4E2D7] bg-paper p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewLayout("split")}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      previewLayout === "split"
                        ? "bg-white text-carbon shadow-2xs"
                        : "text-terrain hover:text-carbon"
                    }`}
                  >
                    <SplitSquareHorizontal className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Compare</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewLayout("side-by-side")}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      previewLayout === "side-by-side"
                        ? "bg-white text-carbon shadow-2xs"
                        : "text-terrain hover:text-carbon"
                    }`}
                  >
                    <Columns2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Split</span>
                  </button>
                </div>
              )}

              {/* Highlighted Studio Editor Button */}
              <button
                type="button"
                onClick={() => {
                  setShowStudio((s) => !s);
                  setPeekOriginal(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  showStudio
                    ? "bg-carbon text-signal-lime ring-2 ring-signal-lime/60"
                    : "bg-signal-lime text-carbon border border-carbon/20 hover:brightness-95 shadow-2xs"
                }`}
              >
                {showStudio ? (
                  <>
                    <X className="h-3.5 w-3.5" />
                    <span>Exit Studio</span>
                  </>
                ) : (
                  <>
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>Studio Editor</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyClipboard}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-white px-2.5 py-1.5 text-xs font-semibold text-carbon hover:bg-paper cursor-pointer"
                title="Copy cutout PNG"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="hidden md:inline">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Copy</span>
                  </>
                )}
              </button>

              {canShare && (
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-white px-2.5 py-1.5 text-xs font-semibold text-carbon hover:bg-paper cursor-pointer"
                  title="Share image"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
              )}

              <div className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-paper px-2 py-1">
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                  className="bg-transparent text-xs font-mono font-semibold text-carbon cursor-pointer focus:outline-none"
                  aria-label="Export format"
                >
                  <option value="png">PNG</option>
                  <option value="webp">WEBP</option>
                  <option value="jpg">JPG</option>
                </select>
                {estimatedSize !== null && (
                  <span className="text-[11px] font-mono text-terrain border-l border-[#D6D4C9] pl-1.5 hidden sm:inline">
                    ~{formatBytes(estimatedSize)}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-carbon px-3.5 py-1.5 text-xs font-bold text-signal-lime hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{isDownloading ? "Exporting…" : `Download ${exportFormat.toUpperCase()}`}</span>
              </button>

              <button
                type="button"
                onClick={handleFullReset}
                className="inline-flex items-center gap-1 rounded-xl border border-[#E4E2D7] bg-white px-2.5 py-1.5 text-xs font-semibold text-carbon hover:bg-paper cursor-pointer"
                title="Upload another image"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </div>

          {/* ── COMPACT STUDIO MODE (2-Column: Live Canvas + Tabbed Inspector) ── */}
          {showStudio ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
              {/* Left: Live Canvas or Brush Canvas */}
              <div className="lg:col-span-7 rounded-2xl border border-[#E4E2D7] bg-white p-3 flex flex-col">
                {studioTab === "brush" ? (
                  <MaskEditorCanvas
                    ref={maskEditorRef}
                    resultUrl={resultUrl}
                    sourceUrl={sourceUrl}
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between px-1 pb-2 text-[11px]">
                      <span className="font-mono uppercase tracking-wider text-terrain">
                        {peekOriginal ? "Original" : `Canvas · ${selectedRatio.name}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-terrain hidden sm:inline">
                          Drag to move · Scroll to zoom
                        </span>
                        <button
                          type="button"
                          onClick={() => setPeekOriginal((p) => !p)}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-semibold cursor-pointer ${
                            peekOriginal
                              ? "border-carbon bg-carbon text-signal-lime"
                              : "border-[#E4E2D7] bg-paper text-carbon hover:border-carbon"
                          }`}
                        >
                          <Eye className="h-3 w-3" />
                          {peekOriginal ? "Showing Original" : "Original"}
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 min-h-[290px] h-[clamp(290px,53vh,440px)] rounded-xl bg-paper/45 border border-[#F0EFE6]">
                      {renderLiveCanvasBox()}
                    </div>
                  </>
                )}
              </div>

              {/* Right: Compact Tabbed Inspector */}
              <div className="lg:col-span-5 rounded-2xl border border-[#E4E2D7] bg-white p-3.5 flex flex-col justify-between gap-3">
                <div className="space-y-3">
                  {/* One-click Presets */}
                  <div className="flex flex-wrap items-center gap-1.5 pb-2.5 border-b border-[#F0EFE6]">
                    <button
                      type="button"
                      onClick={() => applyPreset("product")}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E4E2D7] bg-paper/60 px-2.5 py-1 text-[11px] font-semibold text-carbon hover:border-carbon cursor-pointer"
                    >
                      <ShoppingBag className="h-3 w-3" />
                      Product 1:1
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("avatar")}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E4E2D7] bg-paper/60 px-2.5 py-1 text-[11px] font-semibold text-carbon hover:border-carbon cursor-pointer"
                    >
                      <UserCircle2 className="h-3 w-3" />
                      Avatar
                    </button>
                    <Link
                      href="/passport"
                      onClick={() => setPassportBgColor("#F4F6F9")}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg bg-carbon px-2.5 py-1 text-[11px] font-bold text-signal-lime hover:opacity-90"
                    >
                      <IdCard className="h-3 w-3" />
                      Passport Sheet →
                    </Link>
                  </div>

                  {/* Inspector Tabs */}
                  <div className="grid grid-cols-4 gap-1 rounded-xl border border-[#E4E2D7] bg-paper p-0.5">
                    {(
                      [
                        { id: "backdrop", label: "Backdrop" },
                        { id: "frame", label: "Ratio" },
                        { id: "polish", label: "Polish" },
                        { id: "brush", label: "Brush" },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setStudioTab(t.id)}
                        className={`rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                          studioTab === t.id
                            ? "bg-white text-carbon shadow-2xs"
                            : "text-terrain hover:text-carbon"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* TAB 1: BACKDROP */}
                  {studioTab === "backdrop" && (
                    <div className="space-y-3 pt-1">
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            { id: "transparent", label: "Transparent" },
                            { id: "color", label: "Solid" },
                            { id: "gradient", label: "Gradient" },
                            { id: "blur", label: "Blur" },
                            { id: "image", label: "Photo" },
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setBgMode(m.id)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                              bgMode === m.id
                                ? "bg-carbon text-signal-lime"
                                : "bg-paper text-carbon hover:bg-[#E4E2D7]"
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>

                      {bgMode === "transparent" && (
                        <p className="text-xs text-terrain">
                          Full alpha transparency (use PNG or WEBP export).
                        </p>
                      )}

                      {bgMode === "color" && (
                        <div className="flex flex-wrap items-center gap-2">
                          {SOLID_COLOR_PRESETS.map((preset) => {
                            const active =
                              selectedColor.toLowerCase() === preset.value.toLowerCase();
                            return (
                              <button
                                key={preset.value}
                                type="button"
                                title={preset.name}
                                onClick={() => {
                                  setSelectedColor(preset.value);
                                  setBgMode("color");
                                }}
                                className={`h-7 w-7 rounded-full border transition-transform cursor-pointer ${
                                  active
                                    ? "ring-2 ring-carbon ring-offset-2 scale-105 border-carbon"
                                    : "border-[#D6D4C9] hover:scale-105"
                                }`}
                                style={{ backgroundColor: preset.value }}
                              />
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => colorInputRef.current?.click()}
                            className="h-7 px-2.5 rounded-full border border-[#D6D4C9] bg-paper text-[11px] font-semibold text-carbon hover:border-carbon flex items-center gap-1.5 cursor-pointer"
                          >
                            <span
                              className="h-3 w-3 rounded-full border border-carbon/20"
                              style={{ backgroundColor: customColor }}
                            />
                            Custom
                            <input
                              ref={colorInputRef}
                              type="color"
                              value={customColor}
                              onChange={(e) => {
                                setCustomColor(e.target.value);
                                setSelectedColor(e.target.value);
                                setBgMode("color");
                              }}
                              className="sr-only"
                            />
                          </button>
                        </div>
                      )}

                      {bgMode === "gradient" && (
                        <div className="grid grid-cols-2 gap-1.5">
                          {GRADIENT_PRESETS.map((grad) => {
                            const active = selectedGradient.id === grad.id;
                            return (
                              <button
                                key={grad.id}
                                type="button"
                                onClick={() => {
                                  setSelectedGradient(grad);
                                  setBgMode("gradient");
                                }}
                                className={`flex items-center gap-2 p-1.5 rounded-xl border text-left cursor-pointer ${
                                  active
                                    ? "border-carbon bg-paper ring-1 ring-carbon"
                                    : "border-[#E4E2D7] hover:border-terrain"
                                }`}
                              >
                                <span
                                  className="h-6 w-6 rounded-lg shrink-0 border border-black/10"
                                  style={{ background: grad.css }}
                                />
                                <span className="text-[11px] font-semibold text-carbon truncate">
                                  {grad.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {bgMode === "blur" && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-carbon">Bokeh Blur</span>
                            <span className="font-mono text-terrain">{blurAmount}px</span>
                          </div>
                          <input
                            type="range"
                            min="4"
                            max="40"
                            step="2"
                            value={blurAmount}
                            onChange={(e) => setBlurAmount(Number(e.target.value))}
                            className="w-full accent-carbon h-1.5 bg-[#E4E2D7] rounded-lg cursor-pointer"
                          />
                        </div>
                      )}

                      {bgMode === "image" && (
                        <div className="flex items-center gap-2.5">
                          <input
                            ref={bgFileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleCustomBgUpload(f);
                              e.target.value = "";
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => bgFileRef.current?.click()}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-carbon bg-paper px-3 py-2 text-xs font-semibold text-carbon hover:bg-signal-lime cursor-pointer"
                          >
                            <ImagePlus className="h-3.5 w-3.5" />
                            {customBgUrl ? "Change Photo" : "Upload Background"}
                          </button>
                          {customBgUrl && (
                            <span className="text-[11px] text-emerald-700 font-medium">
                              Active ✓
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: RATIO & CROP */}
                  {studioTab === "frame" && (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-3 gap-1.5">
                        {ASPECT_RATIO_PRESETS.map((opt) => {
                          const isSelected = selectedRatio.id === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setSelectedRatio(opt)}
                              className={`rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer ${
                                isSelected
                                  ? "border-carbon bg-carbon text-paper"
                                  : "border-[#E4E2D7] bg-paper/40 text-carbon hover:border-terrain"
                              }`}
                            >
                              <p className="text-xs font-bold leading-tight">{opt.name}</p>
                              <p
                                className={`text-[10px] truncate ${
                                  isSelected ? "text-paper/75" : "text-terrain"
                                }`}
                              >
                                {opt.label}
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-2 border-t border-[#F0EFE6] space-y-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-carbon w-11">Scale</span>
                          <input
                            type="range"
                            min="0.3"
                            max="2.5"
                            step="0.05"
                            value={scale}
                            onChange={(e) => setScale(parseFloat(e.target.value))}
                            className="flex-1 accent-carbon h-1.5 bg-[#E4E2D7] rounded-lg cursor-pointer"
                          />
                          <span className="text-[11px] font-mono text-terrain w-10 text-right">
                            {Math.round(scale * 100)}%
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setFlipH((f) => !f)}
                            className={`h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                              flipH
                                ? "border-carbon bg-carbon text-signal-lime"
                                : "border-[#E4E2D7] bg-white text-carbon hover:bg-paper"
                            }`}
                          >
                            <FlipHorizontal2 className="h-3 w-3" />
                            Flip
                          </button>
                          <button
                            type="button"
                            onClick={snapBottom}
                            className="h-7 px-2.5 rounded-lg border border-[#E4E2D7] bg-white text-[11px] font-semibold text-carbon hover:bg-paper inline-flex items-center gap-1 cursor-pointer"
                          >
                            <ArrowDownToLine className="h-3 w-3" />
                            Snap Bottom
                          </button>
                          <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-carbon cursor-pointer">
                            <input
                              type="checkbox"
                              checked={trimSubject}
                              onChange={() => setTrimSubject((t) => !t)}
                              className="h-3.5 w-3.5 accent-carbon rounded cursor-pointer"
                            />
                            <Crop className="h-3 w-3 text-terrain" />
                            Trim Edges
                          </label>
                        </div>

                        {trimSubject && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-terrain w-11">Pad</span>
                            <input
                              type="range"
                              min="0"
                              max="80"
                              step="4"
                              value={trimPadding}
                              onChange={(e) => setTrimPadding(Number(e.target.value))}
                              className="flex-1 accent-carbon h-1.5 bg-[#E4E2D7] rounded-lg cursor-pointer"
                            />
                            <span className="text-[11px] font-mono text-terrain w-10 text-right">
                              {trimPadding}px
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: POLISH */}
                  {studioTab === "polish" && (
                    <div className="space-y-3 pt-1">
                      <label className="flex items-center justify-between p-2.5 rounded-xl border border-[#E4E2D7] bg-paper/40 cursor-pointer">
                        <div>
                          <p className="text-xs font-semibold text-carbon">De-fringe Edges</p>
                          <p className="text-[11px] text-terrain">
                            Removes color halo around hair &amp; fur
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={defringe}
                          onChange={() => setDefringe((d) => !d)}
                          className="h-4 w-4 accent-carbon rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 rounded-xl border border-[#E4E2D7] bg-paper/40 cursor-pointer">
                        <div>
                          <p className="text-xs font-semibold text-carbon">Studio Drop Shadow</p>
                          <p className="text-[11px] text-terrain">
                            Adds soft ground shadow behind cutout
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={dropShadow}
                          onChange={() => setDropShadow((d) => !d)}
                          className="h-4 w-4 accent-carbon rounded cursor-pointer"
                        />
                      </label>

                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-carbon">Edge Feather</span>
                          <span className="font-mono text-terrain">{edgeFeather}px</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="0.5"
                          value={edgeFeather}
                          onChange={(e) => setEdgeFeather(parseFloat(e.target.value))}
                          className="w-full accent-carbon h-1.5 bg-[#E4E2D7] rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {/* TAB 4: BRUSH */}
                  {studioTab === "brush" && (
                    <div className="space-y-3 pt-1">
                      <div className="rounded-xl bg-paper border border-[#E4E2D7] p-3 space-y-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-carbon">
                          <Paintbrush className="h-3.5 w-3.5" />
                          Manual Mask Touch-Up
                        </div>
                        <p className="text-[11px] text-terrain leading-relaxed">
                          Paint directly on the canvas to erase leftover background spots or restore
                          missing edges, then click Apply.
                        </p>
                      </div>

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
                              applyMaskEditUrl(URL.createObjectURL(blob));
                              setStudioTab("backdrop");
                            } finally {
                              setIsApplyingEdits(false);
                            }
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-carbon px-4 py-2 text-xs font-bold text-signal-lime hover:opacity-90 disabled:opacity-50 cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {isApplyingEdits ? "Applying…" : "Apply Edits"}
                        </button>

                        <button
                          type="button"
                          onClick={() => maskEditorRef.current?.undo()}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-white px-3 py-2 text-xs font-semibold text-carbon hover:bg-paper cursor-pointer"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          Undo
                        </button>
                      </div>

                      {resultUrl !== originalResultUrl && (
                        <button
                          type="button"
                          onClick={restoreOriginalCutout}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reset AI Cutout
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Inspector Footer */}
                <div className="pt-2.5 border-t border-[#F0EFE6] flex items-center justify-between text-[11px]">
                  <span className="font-mono text-terrain">
                    {selectedRatio.name} · {bgMode}
                  </span>
                  {hasTransformChanges && (
                    <button
                      type="button"
                      onClick={resetTransform}
                      className="inline-flex items-center gap-1 font-semibold text-carbon hover:opacity-75 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset All
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ── DEFAULT COMPACT CUTOUT VIEW (FITS 100% INSIDE LAPTOP SCREEN) ── */
            <>
              {previewLayout === "split" ? (
                <div className="rounded-2xl border border-[#E4E2D7] bg-white p-3 flex items-center justify-center h-[clamp(280px,50vh,430px)]">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="rounded-2xl border border-[#E4E2D7] bg-white p-2.5 flex flex-col h-[clamp(280px,50vh,430px)]">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-terrain px-1 pb-1.5">
                      Original
                    </p>
                    <div className="flex-1 min-h-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sourceUrl}
                        alt="Original"
                        className="w-full h-full object-contain select-none pointer-events-none"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#E4E2D7] bg-white p-2.5 flex flex-col h-[clamp(280px,50vh,430px)]">
                    <div className="flex items-center justify-between px-1 pb-1.5">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-terrain">
                        Result · {selectedRatio.name}
                      </p>
                      <span className="text-[10px] text-terrain">Drag · Scroll to zoom</span>
                    </div>
                    <div className="flex-1 min-h-0">{renderLiveCanvasBox()}</div>
                  </div>
                </div>
              )}

              {/* Compact 1-Row Quick Studio Bar */}
              <div className="rounded-2xl border border-[#E4E2D7] bg-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={trimSubject}
                      onChange={() => setTrimSubject((t) => !t)}
                      className="h-3.5 w-3.5 accent-carbon rounded cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-carbon">Trim Edges</span>
                  </label>

                  {trimSubject && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="range"
                        min="0"
                        max="80"
                        step="4"
                        value={trimPadding}
                        onChange={(e) => setTrimPadding(Number(e.target.value))}
                        className="w-16 accent-carbon h-1.5 bg-[#E4E2D7] rounded-lg cursor-pointer"
                      />
                      <span className="text-[11px] font-mono text-terrain w-8">
                        {trimPadding}px
                      </span>
                    </div>
                  )}

                  <span className="h-4 w-px bg-[#E4E2D7] hidden sm:inline-block" />

                  <button
                    type="button"
                    onClick={() => applyPreset("avatar")}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E4E2D7] bg-paper/60 px-2.5 py-1 text-[11px] font-semibold text-carbon hover:border-carbon cursor-pointer"
                  >
                    <UserCircle2 className="h-3 w-3" />
                    Avatar 1:1
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset("product")}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E4E2D7] bg-paper/60 px-2.5 py-1 text-[11px] font-semibold text-carbon hover:border-carbon cursor-pointer"
                  >
                    <ShoppingBag className="h-3 w-3" />
                    Product 1:1
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setShowStudio(true);
                      setStudioTab("backdrop");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-carbon/20 bg-signal-lime/70 px-3 py-1.5 text-xs font-bold text-carbon hover:bg-signal-lime cursor-pointer"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Edit Background &amp; Crop
                  </button>

                  <Link
                    href="/passport"
                    onClick={() => setPassportBgColor("#F4F6F9")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-carbon px-3 py-1.5 text-xs font-bold text-signal-lime hover:opacity-90"
                  >
                    <IdCard className="h-3.5 w-3.5" />
                    Make Passport Sheet →
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
