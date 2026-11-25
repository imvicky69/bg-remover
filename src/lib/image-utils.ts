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
 * Generates clean, zero-network sample images locally on canvas
 * so first-time users can test xweet bg in one click.
 */
export async function createSampleImageFile(
  kind: "product" | "portrait" | "badge"
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;

  if (kind === "product") {
    // Warm studio gradient backdrop
    const bg = ctx.createLinearGradient(0, 0, 720, 720);
    bg.addColorStop(0, "#E2DFD3");
    bg.addColorStop(1, "#C5C0B0");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 720, 720);

    // Table surface
    ctx.fillStyle = "#B3AD9C";
    ctx.fillRect(0, 490, 720, 230);

    // Soft bottle shadow
    ctx.fillStyle = "rgba(23, 24, 21, 0.18)";
    ctx.beginPath();
    ctx.ellipse(360, 520, 120, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Minimalist ceramic bottle
    const bodyGrad = ctx.createLinearGradient(255, 220, 465, 520);
    bodyGrad.addColorStop(0, "#2F322B");
    bodyGrad.addColorStop(0.45, "#171815");
    bodyGrad.addColorStop(1, "#0D0E0C");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(260, 240, 200, 280, [48, 48, 22, 22]);
    ctx.fill();

    // Bottle neck & cap
    ctx.fillStyle = "#D7F36A";
    ctx.beginPath();
    ctx.roundRect(320, 165, 80, 82, [14, 14, 4, 4]);
    ctx.fill();

    // Label
    ctx.fillStyle = "#F0EFE6";
    ctx.beginPath();
    ctx.roundRect(290, 320, 140, 110, 12);
    ctx.fill();
    ctx.fillStyle = "#171815";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("XWEET", 360, 372);
    ctx.font = "13px monospace";
    ctx.fillStyle = "#858779";
    ctx.fillText("STUDIO N°01", 360, 400);
  } else if (kind === "portrait") {
    const bg = ctx.createLinearGradient(0, 0, 0, 720);
    bg.addColorStop(0, "#8EA8C3");
    bg.addColorStop(1, "#5C7894");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 720, 720);

    // Shoulders
    ctx.fillStyle = "#1E293B";
    ctx.beginPath();
    ctx.ellipse(360, 650, 210, 180, 0, Math.PI, 0);
    ctx.fill();

    // Neck
    ctx.fillStyle = "#E8BE9E";
    ctx.fillRect(325, 380, 70, 110);

    // Head
    ctx.fillStyle = "#F3CCB0";
    ctx.beginPath();
    ctx.ellipse(360, 290, 102, 124, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = "#171815";
    ctx.beginPath();
    ctx.ellipse(360, 215, 110, 82, 0, Math.PI, 0);
    ctx.fill();

    // Glasses
    ctx.strokeStyle = "#171815";
    ctx.lineWidth = 7;
    ctx.strokeRect(292, 265, 56, 38);
    ctx.strokeRect(372, 265, 56, 38);
    ctx.beginPath();
    ctx.moveTo(348, 282);
    ctx.lineTo(372, 282);
    ctx.stroke();
  } else {
    // Colorful geometric badge / sticker on patterned backdrop
    ctx.fillStyle = "#D4D2C7";
    ctx.fillRect(0, 0, 720, 720);
    for (let x = 0; x < 720; x += 40) {
      ctx.fillStyle = "rgba(23,24,21,0.05)";
      ctx.fillRect(x, 0, 20, 720);
    }

    ctx.fillStyle = "#171815";
    ctx.beginPath();
    ctx.arc(360, 360, 195, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#D7F36A";
    ctx.beginPath();
    ctx.arc(360, 360, 155, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#171815";
    ctx.font = "bold 76px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BG", 360, 365);
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Sample failed"))), "image/png")
  );
  return new File([blob], `sample-${kind}.png`, { type: "image/png" });
}
