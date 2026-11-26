"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Printer,
  RotateCcw,
  Plus,
  Eye,
  EyeOff,
  Scissors,
  Sparkles,
  Paintbrush,
  Check,
  Undo2,
  Minus,
  ImageDown,
} from "lucide-react";
import { DropZone } from "@/components/dropzone";
import { AppHeader } from "@/components/app-header";
import { useStudio } from "@/components/studio-provider";
import { MaskEditorCanvas, type MaskEditorHandle } from "@/components/mask-editor";
import {
  analyzePortraitForPassport,
  defringeCanvas,
  formatBytes,
  renderPassportTileToContext,
  type PassportCropFrame,
} from "@/lib/image-utils";
import {
  computeOptimalSheetPlan,
  mmToPx,
  PAGE_SIZE_PRESETS,
  PASSPORT_BACKGROUND_PRESETS,
  PASSPORT_SIZE_PRESETS,
  type CutGuideStyle,
  type PlacedTile,
  type SheetAlignment,
} from "@/lib/passport-layout";
import { buildPdfFromJpegs } from "@/lib/pdf-export";

type PassportExportFormat = "pdf" | "jpg" | "png";

function drawCutGuides(
  ctx: CanvasRenderingContext2D,
  tiles: PlacedTile[],
  pxPerMm: number,
  style: CutGuideStyle
) {
  if (style === "none") return;

  ctx.save();
  if (style === "hairline") {
    ctx.strokeStyle = "rgba(100, 116, 139, 0.48)";
    ctx.lineWidth = Math.max(1, pxPerMm * 0.14);
    for (const t of tiles) {
      ctx.strokeRect(
        t.xMm * pxPerMm,
        t.yMm * pxPerMm,
        t.wMm * pxPerMm,
        t.hMm * pxPerMm
      );
    }
  } else if (style === "corners") {
    ctx.strokeStyle = "rgba(23, 24, 21, 0.55)";
    ctx.lineWidth = Math.max(1, pxPerMm * 0.2);
    const arm = Math.max(4, 2.4 * pxPerMm);
    ctx.beginPath();
    for (const t of tiles) {
      const x1 = t.xMm * pxPerMm;
      const y1 = t.yMm * pxPerMm;
      const x2 = (t.xMm + t.wMm) * pxPerMm;
      const y2 = (t.yMm + t.hMm) * pxPerMm;
      // Top-left
      ctx.moveTo(x1, y1 + arm);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 + arm, y1);
      // Top-right
      ctx.moveTo(x2 - arm, y1);
      ctx.lineTo(x2, y1);
      ctx.lineTo(x2, y1 + arm);
      // Bottom-left
      ctx.moveTo(x1, y2 - arm);
      ctx.lineTo(x1, y2);
      ctx.lineTo(x1 + arm, y2);
      // Bottom-right
      ctx.moveTo(x2 - arm, y2);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2, y2 - arm);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function PassportStudio() {
  const {
    stage,
    progress,
    errorMsg,
    sourceUrl,
    resultUrl,
    originalResultUrl,
    fileName,
    fileSize,
    maxResolution,
    setMaxResolution: onMaxResolutionChange,
    processFile: onFileSelected,
    reset: onReset,
    applyMaskEditUrl: onMaskUpdated,
    restoreOriginalCutout: onRestoreOriginalCutout,
    passportBgColor: bgColor,
    setPassportBgColor: onBgColorChange,
  } = useStudio();
  const cropPreviewRef = useRef<HTMLCanvasElement>(null);
  const cropBoxRef = useRef<HTMLDivElement>(null);
  const sheetPreviewRef = useRef<HTMLCanvasElement>(null);
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const maskEditorRef = useRef<MaskEditorHandle>(null);

  // Loaded & clean (de-fringed) subject canvases for crisp hair/edges on light backgrounds
  const [cleanEdges, setCleanEdges] = useState(true);
  const [rawSubjectCanvas, setRawSubjectCanvas] = useState<HTMLCanvasElement | null>(null);
  const [defringedCanvas, setDefringedCanvas] = useState<HTMLCanvasElement | null>(null);

  // Photo sizing & framing
  const [photoPresetId, setPhotoPresetId] = useState<string>("35x45");
  const [customPhotoMm, setCustomPhotoMm] = useState({ w: 35, h: 45 });
  const [baseCrop, setBaseCrop] = useState<PassportCropFrame>({
    centerXNorm: 0.5,
    centerYNorm: 0.45,
    heightNorm: 0.85,
    detected: false,
  });
  const [zoom, setZoom] = useState(1);
  const [panXNorm, setPanXNorm] = useState(0);
  const [panYNorm, setPanYNorm] = useState(0);
  const [showBiometricGuides, setShowBiometricGuides] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ clientX: 0, clientY: 0, panXNorm: 0, panYNorm: 0 });

  // Backdrop & studio tone
  const [studioVignette, setStudioVignette] = useState(false);
  const [brightnessPct, setBrightnessPct] = useState(103);

  // Print sheet configuration
  const [pagePresetId, setPagePresetId] = useState<string>("4x6");
  const [customPageMm, setCustomPageMm] = useState({ w: 101.6, h: 152.4 });
  const [photoCount, setPhotoCount] = useState<number>(8);
  const [gapMode, setGapMode] = useState<"tight" | "trim" | "wide">("trim");
  const [marginMode, setMarginMode] = useState<"safe" | "borderless">("safe");
  const [cutGuides, setCutGuides] = useState<CutGuideStyle>("hairline");
  const [alignment, setAlignment] = useState<SheetAlignment>("compact");
  const [activePageIdx, setActivePageIdx] = useState(0);

  // Export & touch-up states
  const [exportFormat, setExportFormat] = useState<PassportExportFormat>("pdf");
  const [isExporting, setIsExporting] = useState(false);
  const [showTouchUp, setShowTouchUp] = useState(false);
  const [isApplyingTouchUp, setIsApplyingTouchUp] = useState(false);

  // Load cutout canvas, run auto portrait crop & defringe whenever resultUrl updates
  useEffect(() => {
    if (stage !== "done" || !resultUrl) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      setRawSubjectCanvas(c);
      setBaseCrop(analyzePortraitForPassport(c));
      setZoom(1);
      setPanXNorm(0);
      setPanYNorm(0);
      try {
        setDefringedCanvas(defringeCanvas(c));
      } catch {
        setDefringedCanvas(null);
      }
    };
    img.src = resultUrl;
    return () => {
      cancelled = true;
    };
  }, [stage, resultUrl]);

  const activeSubjectCanvas = cleanEdges && defringedCanvas ? defringedCanvas : rawSubjectCanvas;

  const activePhotoDims = useMemo(() => {
    if (photoPresetId === "custom") {
      return {
        wMm: Math.min(200, Math.max(15, customPhotoMm.w || 35)),
        hMm: Math.min(250, Math.max(15, customPhotoMm.h || 45)),
      };
    }
    const found = PASSPORT_SIZE_PRESETS.find((p) => p.id === photoPresetId) ?? PASSPORT_SIZE_PRESETS[0];
    return { wMm: found.widthMm, hMm: found.heightMm };
  }, [photoPresetId, customPhotoMm]);

  const activePageSpec = useMemo(() => {
    if (pagePresetId === "custom") {
      return {
        id: "custom",
        name: "Custom",
        widthMm: Math.min(500, Math.max(30, customPageMm.w || 101.6)),
        heightMm: Math.min(500, Math.max(30, customPageMm.h || 152.4)),
        defaultMarginMm: 3,
        isSingle: false,
      };
    }
    return PAGE_SIZE_PRESETS.find((p) => p.id === pagePresetId) ?? PAGE_SIZE_PRESETS[0];
  }, [pagePresetId, customPageMm]);

  const gapMm = gapMode === "tight" ? 0 : gapMode === "trim" ? 1.5 : 3;
  const marginMm = activePageSpec.isSingle
    ? 0
    : marginMode === "borderless"
    ? 0
    : activePageSpec.defaultMarginMm;

  const sheetPlan = useMemo(() => {
    return computeOptimalSheetPlan({
      pageWmm: activePageSpec.widthMm,
      pageHmm: activePageSpec.heightMm,
      photoWmm: activePhotoDims.wMm,
      photoHmm: activePhotoDims.hMm,
      requestedCount: activePageSpec.isSingle ? 1 : photoCount,
      marginMm,
      gapMm,
      alignment,
      isSinglePhoto: Boolean(activePageSpec.isSingle),
    });
  }, [activePageSpec, activePhotoDims, photoCount, marginMm, gapMm, alignment]);

  const safeActivePageIdx = Math.min(activePageIdx, Math.max(0, sheetPlan.pages.length - 1));

  // When switching page preset, update photoCount nicely if user hasn't picked a higher multi-page count or if switching from single
  const handleSelectPagePreset = (id: string) => {
    setPagePresetId(id);
    setActivePageIdx(0);
    if (id === "single") return;
    const targetPage = PAGE_SIZE_PRESETS.find((p) => p.id === id);
    if (!targetPage) return;
    const plan = computeOptimalSheetPlan({
      pageWmm: targetPage.widthMm,
      pageHmm: targetPage.heightMm,
      photoWmm: activePhotoDims.wMm,
      photoHmm: activePhotoDims.hMm,
      requestedCount: 99,
      marginMm: marginMode === "borderless" ? 0 : targetPage.defaultMarginMm,
      gapMm,
      alignment,
    });
    if (plan.maxPerSheet > 0) {
      // Snap cleanly to full single sheet default (cap at 12 for A4/Letter so it feels practical)
      setPhotoCount(Math.min(plan.maxPerSheet, id === "a4" || id === "letter" ? Math.min(12, plan.maxPerSheet) : plan.maxPerSheet));
    }
  };

  // Non-passive wheel zoom on single crop preview
  useEffect(() => {
    const el = cropBoxRef.current;
    if (!el || stage !== "done") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.07 : 0.93;
      setZoom((z) => Math.min(2.6, Math.max(0.55, Number((z * factor).toFixed(2)))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [stage]);

  // Render live single passport photo preview
  useEffect(() => {
    const canvas = cropPreviewRef.current;
    const subject = activeSubjectCanvas;
    if (!canvas || !subject || subject.width === 0 || stage !== "done") return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const previewH = 300;
    const previewW = Math.max(120, Math.round(previewH * (activePhotoDims.wMm / activePhotoDims.hMm)));

    canvas.width = Math.round(previewW * dpr);
    canvas.height = Math.round(previewH * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    renderPassportTileToContext(ctx, 0, 0, previewW, previewH, subject, {
      bgColor,
      studioVignette,
      crop: baseCrop,
      zoom,
      panXNorm,
      panYNorm,
      brightnessPct,
    });
  }, [
    stage,
    activeSubjectCanvas,
    activePhotoDims,
    bgColor,
    studioVignette,
    baseCrop,
    zoom,
    panXNorm,
    panYNorm,
    brightnessPct,
  ]);

  // Render live print sheet preview
  useEffect(() => {
    const canvas = sheetPreviewRef.current;
    const subject = activeSubjectCanvas;
    if (!canvas || !subject || subject.width === 0 || stage !== "done") return;

    const page = sheetPlan.pages[safeActivePageIdx] ?? sheetPlan.pages[0];
    if (!page) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const maxBoxW = 520;
    const maxBoxH = 360;
    const scale = Math.min(maxBoxW / sheetPlan.sheetWmm, maxBoxH / sheetPlan.sheetHmm);
    const cssW = Math.max(160, Math.round(sheetPlan.sheetWmm * scale));
    const cssH = Math.max(160, Math.round(sheetPlan.sheetHmm * scale));

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Paper sheet surface
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, cssW, cssH);

    // Pre-render one crisp upright tile at preview scale
    const tileW = Math.max(16, Math.round(activePhotoDims.wMm * scale * dpr));
    const tileH = Math.max(16, Math.round(activePhotoDims.hMm * scale * dpr));
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = tileW;
    tileCanvas.height = tileH;
    const tctx = tileCanvas.getContext("2d")!;
    renderPassportTileToContext(tctx, 0, 0, tileW, tileH, subject, {
      bgColor,
      studioVignette,
      crop: baseCrop,
      zoom,
      panXNorm,
      panYNorm,
      brightnessPct,
    });

    for (const tile of page.tiles) {
      const tx = tile.xMm * scale;
      const ty = tile.yMm * scale;
      const tw = tile.wMm * scale;
      const th = tile.hMm * scale;
      if (tile.rotated) {
        ctx.save();
        ctx.translate(tx + tw / 2, ty + th / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(tileCanvas, -th / 2, -tw / 2, th, tw);
        ctx.restore();
      } else {
        ctx.drawImage(tileCanvas, tx, ty, tw, th);
      }
    }

    if (!activePageSpec.isSingle) {
      drawCutGuides(ctx, page.tiles, scale, cutGuides);

      // Subtle preview-only indicator of clean reusable area
      if (page.reusableRectMm) {
        const r = page.reusableRectMm;
        const rx = r.xMm * scale;
        const ry = r.yMm * scale;
        const rw = r.wMm * scale;
        const rh = r.hMm * scale;
        ctx.save();
        ctx.fillStyle = "rgba(215, 243, 106, 0.16)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(133, 135, 121, 0.45)";
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
        ctx.setLineDash([]);
        if (rw > 90 && rh > 28) {
          ctx.fillStyle = "rgba(23, 24, 21, 0.55)";
          ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            `REUSABLE PAPER · ${Math.round(r.wMm)}×${Math.round(r.hMm)} mm`,
            rx + rw / 2,
            ry + rh / 2
          );
        }
        ctx.restore();
      }
    }
  }, [
    stage,
    activeSubjectCanvas,
    sheetPlan,
    safeActivePageIdx,
    activePhotoDims,
    activePageSpec.isSingle,
    bgColor,
    studioVignette,
    baseCrop,
    zoom,
    panXNorm,
    panYNorm,
    brightnessPct,
    cutGuides,
  ]);

  // Pointer drag handler for intuitive 1:1 framing
  const handleCropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      panXNorm,
      panYNorm,
    };
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !cropBoxRef.current || !activeSubjectCanvas) return;
    const rect = cropBoxRef.current.getBoundingClientRect();
    if (rect.height <= 0) return;

    const effectiveHeightNorm = baseCrop.heightNorm / Math.max(0.25, zoom);
    const scale = rect.height / (effectiveHeightNorm * activeSubjectCanvas.height);

    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;

    const nextPanX = dragStartRef.current.panXNorm + dx / (activeSubjectCanvas.width * scale);
    const nextPanY = dragStartRef.current.panYNorm + dy / (activeSubjectCanvas.height * scale);

    setPanXNorm(Math.max(-0.5, Math.min(0.5, nextPanX)));
    setPanYNorm(Math.max(-0.5, Math.min(0.5, nextPanY)));
  };

  const handleCropPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // noop
    }
  };

  const render300DpiTileCanvas = useCallback((): HTMLCanvasElement | null => {
    const subject = activeSubjectCanvas;
    if (!subject || subject.width === 0) return null;

    const tileW = mmToPx(activePhotoDims.wMm, 300);
    const tileH = mmToPx(activePhotoDims.hMm, 300);
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = tileW;
    tileCanvas.height = tileH;
    const ctx = tileCanvas.getContext("2d")!;

    renderPassportTileToContext(ctx, 0, 0, tileW, tileH, subject, {
      bgColor,
      studioVignette,
      crop: baseCrop,
      zoom,
      panXNorm,
      panYNorm,
      brightnessPct,
    });
    return tileCanvas;
  }, [
    activeSubjectCanvas,
    activePhotoDims,
    bgColor,
    studioVignette,
    baseCrop,
    zoom,
    panXNorm,
    panYNorm,
    brightnessPct,
  ]);

  const render300DpiSheetCanvas = useCallback(
    (pageIndex: number, tileCanvas: HTMLCanvasElement): HTMLCanvasElement => {
      const sheetWpx = mmToPx(sheetPlan.sheetWmm, 300);
      const sheetHpx = mmToPx(sheetPlan.sheetHmm, 300);
      const pxPerMm = 300 / 25.4;

      const sheetCanvas = document.createElement("canvas");
      sheetCanvas.width = sheetWpx;
      sheetCanvas.height = sheetHpx;
      const ctx = sheetCanvas.getContext("2d")!;

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, sheetWpx, sheetHpx);

      const page = sheetPlan.pages[pageIndex];
      if (!page) return sheetCanvas;

      for (const tile of page.tiles) {
        const tx = tile.xMm * pxPerMm;
        const ty = tile.yMm * pxPerMm;
        const tw = tile.wMm * pxPerMm;
        const th = tile.hMm * pxPerMm;

        if (tile.rotated) {
          ctx.save();
          ctx.translate(tx + tw / 2, ty + th / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(tileCanvas, -th / 2, -tw / 2, th, tw);
          ctx.restore();
        } else {
          ctx.drawImage(tileCanvas, tx, ty, tw, th);
        }
      }

      if (!activePageSpec.isSingle) {
        drawCutGuides(ctx, page.tiles, pxPerMm, cutGuides);
      }
      return sheetCanvas;
    },
    [sheetPlan, activePageSpec.isSingle, cutGuides]
  );

  const triggerBlobDownload = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadSheet = async () => {
    const tileCanvas = render300DpiTileCanvas();
    if (!tileCanvas || sheetPlan.pages.length === 0) return;
    setIsExporting(true);

    try {
      const base = (fileName || "passport").replace(/\.[^.]+$/, "");
      const sizeTag = `${Math.round(activePhotoDims.wMm)}x${Math.round(activePhotoDims.hMm)}mm`;

      if (exportFormat === "pdf") {
        const pdfPages = await Promise.all(
          sheetPlan.pages.map(async (_, idx) => {
            const c = render300DpiSheetCanvas(idx, tileCanvas);
            const jpegBlob = await new Promise<Blob>((res, rej) =>
              c.toBlob((b) => (b ? res(b) : rej(new Error("JPEG failed"))), "image/jpeg", 0.96)
            );
            const buf = new Uint8Array(await jpegBlob.arrayBuffer());
            return {
              jpegBytes: buf,
              widthPx: c.width,
              heightPx: c.height,
              widthMm: sheetPlan.sheetWmm,
              heightMm: sheetPlan.sheetHmm,
            };
          })
        );
        const pdfBlob = buildPdfFromJpegs(pdfPages);
        const pageTag = activePageSpec.isSingle ? "single" : `${activePageSpec.id}-${sheetPlan.totalPhotos}pcs`;
        triggerBlobDownload(pdfBlob, `${base}-passport-${sizeTag}-${pageTag}.pdf`);
      } else {
        const mime = exportFormat === "png" ? "image/png" : "image/jpeg";
        const quality = exportFormat === "png" ? undefined : 0.96;
        for (let i = 0; i < sheetPlan.pages.length; i++) {
          const c = render300DpiSheetCanvas(i, tileCanvas);
          const blob = await new Promise<Blob>((res, rej) =>
            c.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), mime, quality)
          );
          const suffix =
            sheetPlan.pages.length > 1
              ? `-page-${i + 1}`
              : activePageSpec.isSingle
              ? "-single"
              : `-${activePageSpec.id}-${sheetPlan.totalPhotos}pcs`;
          triggerBlobDownload(blob, `${base}-passport-${sizeTag}${suffix}.${exportFormat}`);
        }
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadSinglePhoto = async () => {
    const tileCanvas = render300DpiTileCanvas();
    if (!tileCanvas) return;
    setIsExporting(true);
    try {
      const base = (fileName || "passport").replace(/\.[^.]+$/, "");
      const sizeTag = `${Math.round(activePhotoDims.wMm)}x${Math.round(activePhotoDims.hMm)}mm`;
      const format = exportFormat === "png" ? "png" : "jpg";
      const mime = format === "png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob>((res, rej) =>
        tileCanvas.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), mime, 0.96)
      );
      triggerBlobDownload(blob, `${base}-passport-${sizeTag}-300dpi.${format}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = async () => {
    const tileCanvas = render300DpiTileCanvas();
    if (!tileCanvas || sheetPlan.pages.length === 0) return;

    const dataUrls = sheetPlan.pages.map((_, idx) =>
      render300DpiSheetCanvas(idx, tileCanvas).toDataURL("image/png")
    );

    const win = window.open("", "_blank");
    if (!win) return;

    const wMm = sheetPlan.sheetWmm;
    const hMm = sheetPlan.sheetHmm;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Passport Print Sheet — xweet bg</title>
  <style>
    @page { size: ${wMm}mm ${hMm}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; }
    .sheet { width: ${wMm}mm; height: ${hMm}mm; page-break-after: always; display: block; }
    .sheet:last-child { page-break-after: auto; }
    img { width: 100%; height: 100%; display: block; object-fit: contain; }
  </style>
</head>
<body>
  ${dataUrls.map((src) => `<div class="sheet"><img src="${src}" alt="Passport Sheet" /></div>`).join("")}
  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 180); };
  </script>
</body>
</html>`);
    win.document.close();
  };

  // Smart quick count options dynamically adapted to the page max
  const quickCounts = useMemo(() => {
    const max = sheetPlan.maxPerSheet;
    if (max <= 1) return [1];
    const base = [2, 4, 6, 8, 12].filter((n) => n < max);
    const list = [...base.slice(0, 3), max];
    return Array.from(new Set(list));
  }, [sheetPlan.maxPerSheet]);

  // ── IDLE ────────────────────────────────────────────────────────────────────
  if (stage === "idle") {
    return (
      <>
        <AppHeader />
        <div
          className="flex-1 flex flex-col items-center justify-start gap-5 pt-1"
          style={{ animation: "fade-in-up 0.35s ease-out" }}
        >
          <div className="text-center max-w-2xl space-y-2.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D8D5C7] bg-white/80 px-3 py-1 text-[11px] font-mono font-semibold text-carbon">
              <span className="h-1.5 w-1.5 rounded-full bg-signal-lime ring-1 ring-carbon/40" />
              Passport &amp; ID Photo Studio
            </div>
            <h1 className="font-space text-3xl sm:text-5xl font-bold tracking-tight text-carbon leading-[1.08]">
              Passport photos,{" "}
              <span className="underline decoration-signal-lime decoration-4 underline-offset-4">
                packed without waste
              </span>
              .
            </h1>
            <p className="text-sm sm:text-base text-terrain max-w-lg mx-auto">
              Upload a portrait. Local AI removes the background, applies a clean studio backdrop,
              auto-crops head &amp; shoulders, and fits your exact print sheet.
            </p>
          </div>

          <div className="w-full max-w-xl space-y-2">
            <DropZone
              onFileSelected={onFileSelected}
              title="Drop a portrait photo here"
              subtitle="Front-facing, neutral lighting · processed 100% on your device"
              hintBadge="35×45 mm · 2×2 in · 4×6 · A4 · PDF"
            />

            <div className="flex items-center justify-between px-1 text-[11px] text-terrain">
              <span>Max Input Resolution</span>
              <div className="inline-flex rounded-full border border-[#E4E2D7] bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => onMaxResolutionChange(2048)}
                  className={`px-2.5 py-0.5 rounded-full font-semibold transition-colors cursor-pointer ${
                    maxResolution === 2048 ? "bg-carbon text-signal-lime" : "text-terrain hover:text-carbon"
                  }`}
                >
                  2048px Fast
                </button>
                <button
                  type="button"
                  onClick={() => onMaxResolutionChange(0)}
                  className={`px-2.5 py-0.5 rounded-full font-semibold transition-colors cursor-pointer ${
                    maxResolution === 0 ? "bg-carbon text-signal-lime" : "text-terrain hover:text-carbon"
                  }`}
                >
                  Original
                </button>
              </div>
            </div>
          </div>

          {/* Minimal 3-step studio strip */}
          <div className="w-full max-w-xl grid grid-cols-3 divide-x divide-[#E4E2D7] rounded-2xl border border-[#E4E2D7] bg-white/75 text-center py-3 px-2">
            <div className="px-2">
              <p className="font-mono text-[10px] text-terrain uppercase">01 · Cutout</p>
              <p className="text-xs font-semibold text-carbon mt-0.5">Auto Light Backdrop</p>
            </div>
            <div className="px-2">
              <p className="font-mono text-[10px] text-terrain uppercase">02 · Frame</p>
              <p className="text-xs font-semibold text-carbon mt-0.5">Biometric Head Crop</p>
            </div>
            <div className="px-2">
              <p className="font-mono text-[10px] text-terrain uppercase">03 · Print</p>
              <p className="text-xs font-semibold text-carbon mt-0.5">Zero-Waste Sheet Fit</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── BUSY ────────────────────────────────────────────────────────────────────
  if (stage === "busy") {
    return (
      <>
        <AppHeader />
        <div
          className="flex-1 flex flex-col items-center justify-center gap-7 py-12"
          style={{ animation: "fade-in-up 0.3s ease-out" }}
        >
          {sourceUrl && (
            <div className="relative h-40 w-32 rounded-2xl overflow-hidden border border-[#E4E2D7] bg-white shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sourceUrl}
                alt="Processing portrait"
                className="w-full h-full object-cover scale-105 blur-sm opacity-45"
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
              {progress.text || "Preparing passport cutout…"}
            </p>
            <div className="h-2.5 w-full rounded-full bg-[#E4E2D7] overflow-hidden">
              <div
                className="h-full bg-carbon transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(4, progress.value)}%` }}
              />
            </div>
            <p className="text-xs text-terrain font-mono">
              {progress.value}% · Local WebGPU / WASM inference
            </p>
          </div>
        </div>
      </>
    );
  }

  // ── ERROR ───────────────────────────────────────────────────────────────────
  if (stage === "error") {
    return (
      <>
        <AppHeader />
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 space-y-4">
            <div>
              <p className="text-sm font-bold text-red-900">Could not process photo</p>
              <p className="text-xs text-red-700 mt-1">{errorMsg}</p>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="rounded-xl bg-carbon px-4 py-2 text-xs font-semibold text-paper hover:opacity-90 cursor-pointer"
            >
              Try another portrait
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── DONE / STUDIO ───────────────────────────────────────────────────────────
  return (
    <>
      <AppHeader />
      <div className="space-y-4" style={{ animation: "fade-in-up 0.35s ease-out" }}>
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[#E4E2D7] bg-white px-3.5 py-2.5 sm:px-4">
        <div className="flex items-center gap-2 text-xs min-w-0">
          <span className="font-semibold text-carbon truncate max-w-[150px]">{fileName}</span>
          <span className="text-[#D6D4C9]">·</span>
          <span className="font-mono text-terrain">{formatBytes(fileSize)}</span>
          <span className="text-[#D6D4C9] hidden sm:inline">·</span>
          <span className="font-mono text-terrain hidden sm:inline">
            {activePhotoDims.wMm}×{activePhotoDims.hMm} mm
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadSinglePhoto}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-white px-3 py-2 text-xs font-semibold text-carbon hover:bg-paper cursor-pointer"
            title="Download 1 cropped 300 DPI digital passport photo"
          >
            <ImageDown className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">1 Photo</span>
          </button>

          {!activePageSpec.isSingle && (
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-white px-3 py-2 text-xs font-semibold text-carbon hover:bg-paper cursor-pointer"
              title="Print sheet at exact millimeter scale"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>
          )}

          {/* Format selector */}
          <div className="inline-flex items-center rounded-xl border border-[#E4E2D7] bg-paper px-2.5 py-1.5">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as PassportExportFormat)}
              className="bg-transparent text-xs font-mono font-semibold text-carbon cursor-pointer focus:outline-none"
              aria-label="Sheet export format"
            >
              <option value="pdf">PDF (1:1 Print)</option>
              <option value="jpg">JPG (300 DPI)</option>
              <option value="png">PNG (300 DPI)</option>
            </select>
          </div>

          {/* Primary Download CTA */}
          <button
            type="button"
            onClick={handleDownloadSheet}
            disabled={isExporting || sheetPlan.totalPhotos === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-carbon px-4 py-2 text-xs font-bold text-signal-lime hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>
              {isExporting
                ? "Building…"
                : activePageSpec.isSingle
                ? `Download ${exportFormat.toUpperCase()}`
                : `Download Sheet (${exportFormat.toUpperCase()})`}
            </span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-xl border border-[#E4E2D7] bg-white px-3 py-2 text-xs font-semibold text-carbon hover:bg-paper cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Single Crop Preview + Backdrop + Photo Size */}
        <div className="lg:col-span-5 space-y-4">
          {/* Interactive Crop Frame */}
          <div className="rounded-2xl border border-[#E4E2D7] bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-carbon">
                Portrait Framing
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowBiometricGuides((g) => !g)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                    showBiometricGuides
                      ? "border-carbon bg-paper text-carbon"
                      : "border-[#E4E2D7] bg-white text-terrain hover:text-carbon"
                  }`}
                >
                  {showBiometricGuides ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  Guides
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (rawSubjectCanvas) {
                      setBaseCrop(analyzePortraitForPassport(rawSubjectCanvas));
                    }
                    setZoom(1);
                    setPanXNorm(0);
                    setPanYNorm(0);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#E4E2D7] bg-white px-2 py-1 text-[11px] font-semibold text-carbon hover:bg-paper cursor-pointer"
                  title="Re-center on head & shoulders"
                >
                  <RotateCcw className="h-3 w-3" />
                  Auto-Fit
                </button>
              </div>
            </div>

            {/* Studio Mat around Passport Frame */}
            <div className="rounded-xl bg-paper border border-[#E4E2D7] p-3 flex flex-col items-center justify-center min-h-[225px]">
              <div
                ref={cropBoxRef}
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                className={`relative rounded-lg overflow-hidden shadow-sm ring-1 ring-black/10 select-none touch-none ${
                  isDragging ? "cursor-grabbing ring-2 ring-carbon" : "cursor-grab"
                }`}
                style={{
                  aspectRatio: `${activePhotoDims.wMm} / ${activePhotoDims.hMm}`,
                  height: "195px",
                  maxWidth: "100%",
                }}
              >
                <canvas
                  ref={cropPreviewRef}
                  className="w-full h-full block pointer-events-none"
                />

                {/* Subtle ICAO Biometric Alignment Overlay (Preview Only) */}
                {showBiometricGuides && (
                  <div className="pointer-events-none absolute inset-0">
                    {/* Top crown target line (10%) */}
                    <div className="absolute left-0 right-0 top-[10%] border-t border-dashed border-carbon/25" />
                    {/* Eye-zone band (32% - 45%) */}
                    <div className="absolute left-0 right-0 top-[32%] h-[13%] bg-signal-lime/10 border-y border-dotted border-carbon/20" />
                    {/* Head oval (10% - 70%) */}
                    <div className="absolute left-1/2 top-[10%] h-[60%] w-[52%] -translate-x-1/2 rounded-[999px] border border-dashed border-carbon/35" />
                    {/* Vertical centerline */}
                    <div className="absolute top-0 bottom-0 left-1/2 border-l border-dotted border-carbon/20" />
                  </div>
                )}
              </div>

              <p className="mt-2.5 text-[11px] text-terrain font-mono">
                Drag to adjust · Scroll to zoom · {mmToPx(activePhotoDims.wMm)}×
                {mmToPx(activePhotoDims.hMm)} px
              </p>
            </div>

            {/* Zoom + Tone + Edge Controls */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] font-semibold text-carbon w-14 shrink-0">Zoom</span>
                <input
                  type="range"
                  min="0.55"
                  max="2.5"
                  step="0.02"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="flex-1 accent-carbon h-1.5 bg-[#E4E2D7] rounded-lg cursor-pointer"
                />
                <span className="text-[11px] font-mono text-terrain w-10 text-right">
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-[11px] font-semibold text-carbon w-14 shrink-0">Light</span>
                <input
                  type="range"
                  min="85"
                  max="122"
                  step="1"
                  value={brightnessPct}
                  onChange={(e) => setBrightnessPct(Number(e.target.value))}
                  className="flex-1 accent-carbon h-1.5 bg-[#E4E2D7] rounded-lg cursor-pointer"
                />
                <span className="text-[11px] font-mono text-terrain w-10 text-right">
                  {brightnessPct}%
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#F0EFE6]">
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={cleanEdges}
                    onChange={() => setCleanEdges((v) => !v)}
                    className="h-3.5 w-3.5 accent-carbon rounded cursor-pointer"
                  />
                  <span className="text-[11px] font-semibold text-carbon">De-fringe Hair</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={studioVignette}
                    onChange={() => setStudioVignette((v) => !v)}
                    className="h-3.5 w-3.5 accent-carbon rounded cursor-pointer"
                  />
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-carbon">
                    <Sparkles className="h-3 w-3 text-terrain" />
                    Soft Studio Light
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => setShowTouchUp((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-carbon underline underline-offset-2 hover:opacity-75 cursor-pointer"
                >
                  <Paintbrush className="h-3 w-3" />
                  {showTouchUp ? "Close Brush" : "Touch-up"}
                </button>
              </div>
            </div>
          </div>

          {/* Background Color Selector */}
          <div className="rounded-2xl border border-[#E4E2D7] bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-carbon">
                Light Backdrop
              </span>
              <span className="text-[11px] font-mono text-terrain uppercase">{bgColor}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {PASSPORT_BACKGROUND_PRESETS.map((preset) => {
                const active = bgColor.toLowerCase() === preset.color.toLowerCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onBgColorChange(preset.color)}
                    title={preset.name}
                    className={`flex items-center gap-1.5 rounded-full border pl-1.5 pr-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                      active
                        ? "border-carbon bg-carbon text-paper"
                        : "border-[#E4E2D7] bg-paper/60 text-carbon hover:border-terrain"
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-black/15 shrink-0"
                      style={{ backgroundColor: preset.color }}
                    />
                    {preset.name}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => colorPickerRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full border border-[#E4E2D7] bg-white pl-2 pr-2.5 py-1 text-[11px] font-semibold text-carbon hover:border-carbon cursor-pointer"
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-black/20"
                  style={{
                    background:
                      "conic-gradient(from 0deg, #ff7eb3, #ffd36e, #8ce99a, #74c0fc, #b197fc, #ff7eb3)",
                  }}
                />
                Custom
                <input
                  ref={colorPickerRef}
                  type="color"
                  value={bgColor}
                  onChange={(e) => onBgColorChange(e.target.value)}
                  className="sr-only"
                />
              </button>
            </div>
          </div>

          {/* Passport Size Preset Selector */}
          <div className="rounded-2xl border border-[#E4E2D7] bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-carbon">
                Passport Size
              </span>
              <span className="text-[11px] text-terrain">
                {photoPresetId === "custom"
                  ? `${activePhotoDims.wMm} × ${activePhotoDims.hMm} mm`
                  : PASSPORT_SIZE_PRESETS.find((p) => p.id === photoPresetId)?.region}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {PASSPORT_SIZE_PRESETS.map((preset) => {
                const active = photoPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setPhotoPresetId(preset.id)}
                    className={`rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer ${
                      active
                        ? "border-carbon bg-carbon text-paper"
                        : "border-[#E4E2D7] bg-paper/40 text-carbon hover:border-terrain"
                    }`}
                  >
                    <p className="text-xs font-bold leading-tight">{preset.name}</p>
                    <p
                      className={`text-[10px] truncate mt-0.5 ${
                        active ? "text-paper/75" : "text-terrain"
                      }`}
                    >
                      {preset.region}
                    </p>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setPhotoPresetId("custom")}
                className={`rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer ${
                  photoPresetId === "custom"
                    ? "border-carbon bg-carbon text-paper"
                    : "border-[#E4E2D7] bg-paper/40 text-carbon hover:border-terrain"
                }`}
              >
                <p className="text-xs font-bold leading-tight">Custom mm</p>
                <p
                  className={`text-[10px] truncate mt-0.5 ${
                    photoPresetId === "custom" ? "text-paper/75" : "text-terrain"
                  }`}
                >
                  Exact W × H
                </p>
              </button>
            </div>

            {photoPresetId === "custom" && (
              <div className="flex items-center gap-2 pt-1">
                <label className="flex-1 flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-paper px-2.5 py-1.5 text-xs">
                  <span className="text-terrain font-mono">W</span>
                  <input
                    type="number"
                    min={15}
                    max={200}
                    value={customPhotoMm.w}
                    onChange={(e) =>
                      setCustomPhotoMm((prev) => ({ ...prev, w: Number(e.target.value) }))
                    }
                    className="w-full bg-transparent font-mono font-semibold text-carbon focus:outline-none"
                  />
                  <span className="text-[10px] text-terrain">mm</span>
                </label>
                <label className="flex-1 flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-paper px-2.5 py-1.5 text-xs">
                  <span className="text-terrain font-mono">H</span>
                  <input
                    type="number"
                    min={15}
                    max={250}
                    value={customPhotoMm.h}
                    onChange={(e) =>
                      setCustomPhotoMm((prev) => ({ ...prev, h: Number(e.target.value) }))
                    }
                    className="w-full bg-transparent font-mono font-semibold text-carbon focus:outline-none"
                  />
                  <span className="text-[10px] text-terrain">mm</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Print Page Selection + Photo Count + Zero-Waste Preview */}
        <div className="lg:col-span-7 space-y-4">
          {/* Sheet Controls Card */}
          <div className="rounded-2xl border border-[#E4E2D7] bg-white p-4 sm:p-5 space-y-4">
            {/* Page Size Picker */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-carbon">
                  Print Page Size
                </span>
                <span className="text-[11px] font-mono text-terrain">
                  {activePageSpec.isSingle
                    ? `${activePhotoDims.wMm} × ${activePhotoDims.hMm} mm`
                    : `${sheetPlan.sheetWmm} × ${sheetPlan.sheetHmm} mm`}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PAGE_SIZE_PRESETS.map((page) => {
                  const active = pagePresetId === page.id;
                  return (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => handleSelectPagePreset(page.id)}
                      className={`rounded-xl border px-3 py-1.5 text-left transition-all cursor-pointer ${
                        active
                          ? "border-carbon bg-carbon text-signal-lime"
                          : "border-[#E4E2D7] bg-paper/50 text-carbon hover:border-terrain"
                      }`}
                    >
                      <span className="text-xs font-bold">{page.name}</span>
                      <span
                        className={`ml-1.5 text-[10px] ${
                          active ? "text-paper/75" : "text-terrain"
                        }`}
                      >
                        {page.tag}
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setPagePresetId("custom");
                    setActivePageIdx(0);
                  }}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    pagePresetId === "custom"
                      ? "border-carbon bg-carbon text-signal-lime"
                      : "border-[#E4E2D7] bg-paper/50 text-carbon hover:border-terrain"
                  }`}
                >
                  Custom Page
                </button>
              </div>

              {pagePresetId === "custom" && (
                <div className="flex items-center gap-2 pt-1 max-w-xs">
                  <label className="flex-1 flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-paper px-2.5 py-1.5 text-xs">
                    <span className="text-terrain font-mono">W</span>
                    <input
                      type="number"
                      min={30}
                      max={500}
                      value={customPageMm.w}
                      onChange={(e) =>
                        setCustomPageMm((prev) => ({ ...prev, w: Number(e.target.value) }))
                      }
                      className="w-full bg-transparent font-mono font-semibold text-carbon focus:outline-none"
                    />
                    <span className="text-[10px] text-terrain">mm</span>
                  </label>
                  <label className="flex-1 flex items-center gap-1.5 rounded-xl border border-[#E4E2D7] bg-paper px-2.5 py-1.5 text-xs">
                    <span className="text-terrain font-mono">H</span>
                    <input
                      type="number"
                      min={30}
                      max={500}
                      value={customPageMm.h}
                      onChange={(e) =>
                        setCustomPageMm((prev) => ({ ...prev, h: Number(e.target.value) }))
                      }
                      className="w-full bg-transparent font-mono font-semibold text-carbon focus:outline-none"
                    />
                    <span className="text-[10px] text-terrain">mm</span>
                  </label>
                </div>
              )}
            </div>

            {/* Number of Photos + Packing Options */}
            {!activePageSpec.isSingle && (
              <div className="pt-3 border-t border-[#F0EFE6] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-carbon">
                      Photos
                    </span>

                    {/* Stepper */}
                    <div className="inline-flex items-center rounded-xl border border-[#E4E2D7] bg-paper p-0.5">
                      <button
                        type="button"
                        onClick={() => setPhotoCount((c) => Math.max(1, c - 1))}
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-carbon hover:bg-white cursor-pointer"
                        aria-label="Decrease photo count"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={80}
                        value={photoCount}
                        onChange={(e) =>
                          setPhotoCount(Math.min(80, Math.max(1, Number(e.target.value) || 1)))
                        }
                        className="w-10 bg-transparent text-center font-mono text-xs font-bold text-carbon focus:outline-none"
                        aria-label="Number of passport photos"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotoCount((c) => Math.min(80, c + 1))}
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-carbon hover:bg-white cursor-pointer"
                        aria-label="Increase photo count"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Quick Count Chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {quickCounts.map((n) => {
                      const isMax = n === sheetPlan.maxPerSheet;
                      const active = photoCount === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setPhotoCount(n)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                            active
                              ? "bg-carbon text-signal-lime"
                              : "border border-[#E4E2D7] bg-white text-carbon hover:bg-paper"
                          }`}
                        >
                          {isMax ? `Max (${n})` : n}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Borderless unlock tip (e.g. 2x2" on 4x6" fits 6 instead of 2 when borderless) */}
                {marginMode === "safe" &&
                  sheetPlan.borderlessMaxPerSheet > sheetPlan.maxPerSheet && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-signal-lime/35 border border-carbon/15 px-3 py-2 text-[11px] text-carbon">
                      <span>
                        Tip: Borderless printing fits{" "}
                        <strong>{sheetPlan.borderlessMaxPerSheet} photos</strong> per page instead
                        of {sheetPlan.maxPerSheet}.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setMarginMode("borderless");
                          setGapMode("tight");
                          setPhotoCount(sheetPlan.borderlessMaxPerSheet);
                        }}
                        className="rounded-lg bg-carbon px-2.5 py-1 text-[11px] font-bold text-signal-lime cursor-pointer"
                      >
                        Use Borderless ({sheetPlan.borderlessMaxPerSheet})
                      </button>
                    </div>
                  )}

                {/* Fine Sheet Options */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-terrain font-semibold">Gap</span>
                    <div className="inline-flex rounded-lg border border-[#E4E2D7] bg-paper p-0.5">
                      {(
                        [
                          { id: "tight", label: "0mm" },
                          { id: "trim", label: "1.5mm" },
                          { id: "wide", label: "3mm" },
                        ] as const
                      ).map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setGapMode(g.id)}
                          className={`px-2 py-0.5 rounded-md font-mono font-semibold cursor-pointer ${
                            gapMode === g.id ? "bg-white text-carbon shadow-2xs" : "text-terrain"
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-terrain font-semibold">Cuts</span>
                    <div className="inline-flex rounded-lg border border-[#E4E2D7] bg-paper p-0.5">
                      {(
                        [
                          { id: "hairline", label: "Border" },
                          { id: "corners", label: "Marks" },
                          { id: "none", label: "None" },
                        ] as const
                      ).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCutGuides(c.id)}
                          className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
                            cutGuides === c.id ? "bg-white text-carbon shadow-2xs" : "text-terrain"
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-terrain font-semibold">Margin</span>
                    <div className="inline-flex rounded-lg border border-[#E4E2D7] bg-paper p-0.5">
                      <button
                        type="button"
                        onClick={() => setMarginMode("safe")}
                        className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
                          marginMode === "safe" ? "bg-white text-carbon shadow-2xs" : "text-terrain"
                        }`}
                      >
                        Safe
                      </button>
                      <button
                        type="button"
                        onClick={() => setMarginMode("borderless")}
                        className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
                          marginMode === "borderless"
                            ? "bg-white text-carbon shadow-2xs"
                            : "text-terrain"
                        }`}
                      >
                        0mm
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-terrain font-semibold">Pack</span>
                    <div className="inline-flex rounded-lg border border-[#E4E2D7] bg-paper p-0.5">
                      <button
                        type="button"
                        onClick={() => setAlignment("compact")}
                        className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
                          alignment === "compact"
                            ? "bg-white text-carbon shadow-2xs"
                            : "text-terrain"
                        }`}
                      >
                        Save Paper
                      </button>
                      <button
                        type="button"
                        onClick={() => setAlignment("center")}
                        className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
                          alignment === "center" ? "bg-white text-carbon shadow-2xs" : "text-terrain"
                        }`}
                      >
                        Center
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Live Sheet Preview Card */}
          <div className="rounded-2xl border border-[#E4E2D7] bg-white p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Scissors className="h-3.5 w-3.5 text-terrain" />
                <span className="text-xs font-bold uppercase tracking-wider text-carbon">
                  Print Sheet Preview
                </span>
              </div>
              <span className="text-[11px] font-mono text-terrain">{sheetPlan.summaryLabel}</span>
            </div>

            {sheetPlan.pages.length > 1 && (
              <div className="flex items-center gap-1.5">
                {sheetPlan.pages.map((p, idx) => (
                  <button
                    key={p.pageIndex}
                    type="button"
                    onClick={() => setActivePageIdx(idx)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-mono font-semibold cursor-pointer ${
                      safeActivePageIdx === idx
                        ? "bg-carbon text-signal-lime"
                        : "border border-[#E4E2D7] bg-paper text-carbon"
                    }`}
                  >
                    Page {idx + 1} ({p.tiles.length})
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-xl bg-paper border border-[#E4E2D7] p-4 flex items-center justify-center min-h-[250px]">
              {sheetPlan.totalPhotos === 0 ? (
                <p className="text-xs text-red-700 font-medium">
                  Selected photo size ({activePhotoDims.wMm}×{activePhotoDims.hMm} mm) is larger than
                  the selected page.
                </p>
              ) : (
                <canvas
                  ref={sheetPreviewRef}
                  className="rounded-md shadow-md ring-1 ring-black/10 max-w-full h-auto"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-terrain font-mono">
              <span>
                300 DPI output · {mmToPx(sheetPlan.sheetWmm)}×{mmToPx(sheetPlan.sheetHmm)} px
              </span>
              {sheetPlan.hasRotatedTiles && (
                <span>Auto-rotated rows to fit maximum photos</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Optional Manual Touch-Up Drawer */}
      {showTouchUp && resultUrl && sourceUrl && (
        <div className="rounded-2xl border border-[#E4E2D7] bg-white p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-carbon">
                Manual Mask Touch-Up
              </p>
              <p className="text-[11px] text-terrain">
                Erase stray spots or restore collar/hair edges, then click Apply
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTouchUp(false)}
              className="text-xs font-semibold text-terrain hover:text-carbon cursor-pointer"
            >
              Close
            </button>
          </div>

          <MaskEditorCanvas ref={maskEditorRef} resultUrl={resultUrl} sourceUrl={sourceUrl} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isApplyingTouchUp}
              onClick={async () => {
                if (!maskEditorRef.current) return;
                setIsApplyingTouchUp(true);
                try {
                  const blob = await maskEditorRef.current.exportPng();
                  if (!blob) return;
                  const newUrl = URL.createObjectURL(blob);
                  onMaskUpdated(newUrl);
                } finally {
                  setIsApplyingTouchUp(false);
                }
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-carbon px-4 py-2.5 text-xs font-bold text-signal-lime hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              {isApplyingTouchUp ? "Applying…" : "Apply Edits to Sheet"}
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
                onClick={onRestoreOriginalCutout}
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
    </>
  );
}
