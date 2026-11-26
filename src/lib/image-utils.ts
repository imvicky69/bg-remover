/* eslint-disable @typescript-eslint/no-explicit-any */

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Client-side HEIC / HEIF decoder using libheif-js WASM bundle.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  const libheif: any = await import("libheif-js/wasm-bundle");
  const lib = libheif.default ?? libheif;
  const buf = await file.arrayBuffer();
  const decoder = new lib.HeifDecoder();
  const data = decoder.decode(new Uint8Array(buf));

  if (!data || data.length === 0) {
    throw new Error("No image frames found in HEIC file.");
  }

  const image = data[0];
  const width: number = image.get_width();
  const height: number = image.get_height();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(width, height);

  await new Promise<void>((resolve, reject) => {
    image.display(imgData, (result: unknown) => {
      if (!result) reject(new Error("libheif display failed"));
      else resolve();
    });
  });

  ctx.putImageData(imgData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95)
  );

  if (!blob || blob.size < 500) {
    throw new Error("HEIC conversion produced empty output.");
  }

  return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
    type: "image/jpeg",
  });
}

/**
 * Color decontamination (anti-halo / de-fringe):
 * Shifts RGB of semi-transparent edge pixels (alpha 5..235) toward nearby
 * opaque foreground pixels to remove background color bleed on fur/hair.
 */
export function defringeCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(source, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const copy = new Uint8ClampedArray(d);

  const radius = 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const a = copy[idx + 3];
      if (a > 4 && a < 235) {
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let weightSum = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const nIdx = (ny * w + nx) * 4;
            const na = copy[nIdx + 3];
            if (na >= 235) {
              const wt = na;
              rSum += copy[nIdx] * wt;
              gSum += copy[nIdx + 1] * wt;
              bSum += copy[nIdx + 2] * wt;
              weightSum += wt;
            }
          }
        }

        if (weightSum > 0) {
          const blend = Math.min(0.85, (235 - a) / 235);
          d[idx] = Math.round(copy[idx] * (1 - blend) + (rSum / weightSum) * blend);
          d[idx + 1] = Math.round(copy[idx + 1] * (1 - blend) + (gSum / weightSum) * blend);
          d[idx + 2] = Math.round(copy[idx + 2] * (1 - blend) + (bSum / weightSum) * blend);
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return out;
}

/**
 * Finds the tight bounding box of non-transparent pixels in a canvas
 * and returns a cropped canvas with optional padding (in pixels).
 */
export function trimCanvasToSubject(
  source: HTMLCanvasElement,
  padding = 16
): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const ctx = source.getContext("2d")!;
  const d = ctx.getImageData(0, 0, w, h).data;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return source;
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = cropW + padding * 2;
  out.height = cropH + padding * 2;
  out.getContext("2d")!.drawImage(source, minX, minY, cropW, cropH, padding, padding, cropW, cropH);
  return out;
}

/**
 * Downscales oversized 12MP–48MP photos to maxDimension (e.g. 2048px)
 * to prevent mobile Safari / browser canvas memory spikes.
 */
export async function downscaleImageIfNeeded(
  file: File,
  maxDimension: number
): Promise<File> {
  if (!maxDimension || maxDimension <= 0) return file;

  const bmp = await createImageBitmap(file);
  const { width, height } = bmp;
  if (width <= maxDimension && height <= maxDimension) {
    bmp.close();
    return file;
  }

  const ratio = Math.min(maxDimension / width, maxDimension / height);
  const targetW = Math.max(1, Math.round(width * ratio));
  const targetH = Math.max(1, Math.round(height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, targetW, targetH);
  bmp.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, ".png"), {
    type: "image/png",
  });
}

export interface PassportCropFrame {
  /** Normalized horizontal center of crop relative to source width (0..1) */
  centerXNorm: number;
  /** Normalized vertical center of crop relative to source height (0..1) */
  centerYNorm: number;
  /** Normalized crop height relative to source height */
  heightNorm: number;
  /** Whether a clear portrait silhouette was detected */
  detected: boolean;
}

/**
 * Analyzes a foreground cutout canvas to locate the person's head & shoulders
 * and returns a passport-compliant crop frame (~10% headroom, ~60% head height,
 * shoulders anchored cleanly to the bottom edge).
 */
export function analyzePortraitForPassport(source: HTMLCanvasElement): PassportCropFrame {
  const w = source.width;
  const h = source.height;
  if (w < 8 || h < 8) {
    return { centerXNorm: 0.5, centerYNorm: 0.45, heightNorm: 0.9, detected: false };
  }

  const maxAnalysisH = 240;
  const scale = Math.min(1, maxAnalysisH / h);
  const aw = Math.max(8, Math.round(w * scale));
  const ah = Math.max(8, Math.round(h * scale));

  const tmp = document.createElement("canvas");
  tmp.width = aw;
  tmp.height = ah;
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(source, 0, 0, aw, ah);
  const data = tctx.getImageData(0, 0, aw, ah).data;

  const alphaThresh = 24;
  const minRowPixels = Math.max(2, Math.round(aw * 0.015));

  const rowCounts = new Int32Array(ah);
  const rowCenters = new Float32Array(ah);

  for (let y = 0; y < ah; y++) {
    let count = 0;
    let sumX = 0;
    const rowBase = y * aw * 4;
    for (let x = 0; x < aw; x++) {
      if (data[rowBase + x * 4 + 3] > alphaThresh) {
        count++;
        sumX += x;
      }
    }
    rowCounts[y] = count;
    rowCenters[y] = count > 0 ? sumX / count : aw / 2;
  }

  // Find topY (skip isolated 1px speckles)
  let topY = -1;
  for (let y = 0; y < ah - 2; y++) {
    if (rowCounts[y] >= minRowPixels) {
      let support = 0;
      if (rowCounts[y + 1] >= minRowPixels) support++;
      if (rowCounts[y + 2] >= minRowPixels) support++;
      if (y + 3 < ah && rowCounts[y + 3] >= minRowPixels) support++;
      if (support >= 2) {
        topY = y;
        break;
      }
    }
  }

  let bottomY = -1;
  for (let y = ah - 1; y >= 0; y--) {
    if (rowCounts[y] >= minRowPixels) {
      bottomY = y;
      break;
    }
  }

  if (topY < 0 || bottomY <= topY + 6) {
    return { centerXNorm: 0.5, centerYNorm: 0.45, heightNorm: 0.9, detected: false };
  }

  const subjH = bottomY - topY;

  // Estimate head horizontal center from top rows
  const topSampleEnd = Math.min(bottomY, topY + Math.max(6, Math.round(subjH * 0.14)));
  const topCs: number[] = [];
  for (let y = topY; y <= topSampleEnd; y++) {
    if (rowCounts[y] >= minRowPixels) topCs.push(rowCenters[y]);
  }
  topCs.sort((a, b) => a - b);
  const initialCenterX = topCs.length > 0 ? topCs[Math.floor(topCs.length / 2)] : aw / 2;

  // Extract contiguous span closest to initialCenterX on each row
  const spanW = new Float32Array(ah);
  const spanC = new Float32Array(ah);
  const maxGap = Math.max(3, Math.round(aw * 0.02));

  for (let y = topY; y <= bottomY; y++) {
    const rowBase = y * aw * 4;
    let bestStart = -1;
    let bestEnd = -1;
    let bestDist = Infinity;

    let x = 0;
    while (x < aw) {
      if (data[rowBase + x * 4 + 3] > alphaThresh) {
        const start = x;
        let end = x;
        let gap = 0;
        while (x < aw) {
          if (data[rowBase + x * 4 + 3] > alphaThresh) {
            end = x;
            gap = 0;
          } else {
            gap++;
            if (gap > maxGap) break;
          }
          x++;
        }
        const mid = (start + end) / 2;
        const dist = Math.abs(mid - initialCenterX);
        if (end - start + 1 >= minRowPixels && dist < bestDist) {
          bestDist = dist;
          bestStart = start;
          bestEnd = end;
        }
      }
      x++;
    }

    if (bestStart >= 0) {
      spanW[y] = bestEnd - bestStart + 1;
      spanC[y] = (bestStart + bestEnd) / 2;
    } else {
      spanW[y] = rowCounts[y];
      spanC[y] = initialCenterX;
    }
  }

  // Smooth widths with a 5-row window
  const smoothW = new Float32Array(ah);
  for (let y = topY; y <= bottomY; y++) {
    let sum = 0;
    let cnt = 0;
    for (let k = -2; k <= 2; k++) {
      const yy = y + k;
      if (yy >= topY && yy <= bottomY) {
        sum += spanW[yy];
        cnt++;
      }
    }
    smoothW[y] = cnt > 0 ? sum / cnt : spanW[y];
  }

  // Track cranium/head width before shoulders flare outward
  let runningHeadW = 0;
  let shoulderY = -1;
  for (let y = topY; y <= bottomY; y++) {
    const dy = y - topY;
    const curW = smoothW[y];
    if (dy <= Math.max(8, runningHeadW * 0.8)) {
      if (curW > runningHeadW) runningHeadW = curW;
    } else if (runningHeadW > 0 && curW >= runningHeadW * 1.35) {
      // Confirm shoulder flare persists
      let persist = 0;
      for (let k = 1; k <= 3 && y + k <= bottomY; k++) {
        if (smoothW[y + k] >= runningHeadW * 1.25) persist++;
      }
      if (persist >= 2) {
        shoulderY = y;
        break;
      }
    }
  }

  if (runningHeadW < 6) runningHeadW = Math.max(8, aw * 0.2);

  let estHeadH: number;
  if (shoulderY > topY) {
    estHeadH = Math.min(
      runningHeadW * 1.45,
      Math.max(runningHeadW * 1.12, (shoulderY - topY) * 0.86)
    );
  } else {
    estHeadH = Math.min(subjH * 0.78, Math.max(runningHeadW * 1.28, subjH * 0.56));
  }
  estHeadH = Math.max(14, estHeadH);

  // Median face center across head region
  const faceCs: number[] = [];
  const fStart = Math.round(topY + estHeadH * 0.12);
  const fEnd = Math.min(bottomY, Math.round(topY + estHeadH * 0.78));
  for (let y = fStart; y <= fEnd; y++) {
    if (spanW[y] > 0) faceCs.push(spanC[y]);
  }
  faceCs.sort((a, b) => a - b);
  const faceCenterX = faceCs.length > 0 ? faceCs[Math.floor(faceCs.length / 2)] : initialCenterX;

  // Target: ~10% headroom above crown (unless hair was already clipped at top edge), head = ~60% of frame height
  let frameH = estHeadH / 0.6;
  let cropTop = topY <= 2 ? 0 : topY - 0.1 * frameH;
  let cropBottom = cropTop + frameH;

  // Prevent floating chest cutoff when the source image ends higher than torso
  if (cropBottom > bottomY && subjH >= estHeadH * 0.82) {
    cropBottom = bottomY;
    frameH = topY <= 2 ? subjH : subjH / 0.89;
    cropTop = cropBottom - frameH;
  }

  const centerXNorm = Math.min(0.95, Math.max(0.05, faceCenterX / aw));
  const centerYNorm = Math.min(0.95, Math.max(0.05, (cropTop + cropBottom) / 2 / ah));
  const heightNorm = Math.min(1.4, Math.max(0.14, frameH / ah));

  return { centerXNorm, centerYNorm, heightNorm, detected: true };
}

export interface RenderPassportTileOptions {
  bgColor: string;
  studioVignette?: boolean;
  crop: PassportCropFrame;
  zoom: number;
  panXNorm: number;
  panYNorm: number;
  brightnessPct?: number;
  edgeFeather?: number;
}

/**
 * Renders a cropped passport photo onto a destination canvas context at exact
 * destination rect (dx, dy, dw, dh). Shared by preview, single export, and sheet export.
 */
export function renderPassportTileToContext(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  subjectCanvas: HTMLCanvasElement,
  opts: RenderPassportTileOptions
) {
  const {
    bgColor,
    studioVignette = false,
    crop,
    zoom,
    panXNorm,
    panYNorm,
    brightnessPct = 100,
    edgeFeather = 0,
  } = opts;

  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();

  // Base background fill
  ctx.fillStyle = bgColor;
  ctx.fillRect(dx, dy, dw, dh);

  // Optional subtle soft center lift
  if (studioVignette) {
    const grad = ctx.createRadialGradient(
      dx + dw * 0.5,
      dy + dh * 0.42,
      dw * 0.08,
      dx + dw * 0.5,
      dy + dh * 0.48,
      Math.max(dw, dh) * 0.85
    );
    grad.addColorStop(0, "rgba(255,255,255,0.38)");
    grad.addColorStop(1, "rgba(23,24,21,0.04)");
    ctx.fillStyle = grad;
    ctx.fillRect(dx, dy, dw, dh);
  }

  const subjW = subjectCanvas.width;
  const subjH = subjectCanvas.height;
  const effectiveHeightNorm = crop.heightNorm / Math.max(0.25, zoom);
  const cropH = effectiveHeightNorm * subjH;
  const scale = dh / cropH;

  const targetCenterX = (crop.centerXNorm - panXNorm) * subjW;
  const targetCenterY = (crop.centerYNorm - panYNorm) * subjH;

  const drawX = dx + dw / 2 - targetCenterX * scale;
  const drawY = dy + dh / 2 - targetCenterY * scale;

  const filters: string[] = [];
  if (brightnessPct !== 100) {
    filters.push(`brightness(${brightnessPct}%)`);
  }
  if (edgeFeather > 0) {
    filters.push(`blur(${edgeFeather * 0.45}px)`);
  }
  if (filters.length > 0) {
    ctx.filter = filters.join(" ");
  }

  ctx.drawImage(subjectCanvas, drawX, drawY, subjW * scale, subjH * scale);
  ctx.restore();
}
