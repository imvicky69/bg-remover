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
