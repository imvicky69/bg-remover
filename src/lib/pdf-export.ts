/**
 * Zero-dependency 300 DPI multi-page PDF writer wrapping baseline RGB JPEG streams.
 * Preserves exact physical millimeter dimensions so browsers and printers print 1:1.
 */

export interface PdfJpegPage {
  jpegBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
}

const MM_TO_PT = 72 / 25.4;

export function buildPdfFromJpegs(pages: PdfJpegPage[]): Blob {
  if (pages.length === 0) {
    throw new Error("Cannot build empty PDF.");
  }

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0]; // 1-based object table (index 0 unused)
  let currentOffset = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentOffset += bytes.byteLength;
  };

  const pushStr = (str: string) => {
    pushBytes(encoder.encode(str));
  };

  // Object numbering:
  // 1: Catalog
  // 2: Pages
  // For each page i (0..N-1):
  //   pageObj = 3 + i * 3
  //   contentObj = 3 + i * 3 + 1
  //   imageObj = 3 + i * 3 + 2
  const pageCount = pages.length;
  const pageIds: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    pageIds.push(3 + i * 3);
  }

  // Binary PDF header comment per PDF 1.4 spec (>127 bytes ensure binary transfer)
  pushBytes(
    new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
      0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
    ])
  );

  // 1: Catalog
  offsets.push(currentOffset);
  pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // 2: Pages
  offsets.push(currentOffset);
  pushStr(
    `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>\nendobj\n`
  );

  for (let i = 0; i < pageCount; i++) {
    const p = pages[i];
    const pageObj = 3 + i * 3;
    const contentObj = pageObj + 1;
    const imageObj = pageObj + 2;

    const wPt = (p.widthMm * MM_TO_PT).toFixed(2);
    const hPt = (p.heightMm * MM_TO_PT).toFixed(2);
    const contentStream = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im0 Do Q\n`;

    // Page object
    offsets.push(currentOffset);
    pushStr(
      `${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im0 ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`
    );

    // Content stream object
    offsets.push(currentOffset);
    pushStr(
      `${contentObj} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
    );

    // JPEG Image XObject
    offsets.push(currentOffset);
    pushStr(
      `${imageObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.byteLength} >>\nstream\n`
    );
    pushBytes(p.jpegBytes);
    pushStr("\nendstream\nendobj\n");
  }

  const xrefOffset = currentOffset;
  const totalObjects = offsets.length;
  pushStr(`xref\n0 ${totalObjects}\n`);
  pushStr("0000000000 65535 f \n");
  for (let i = 1; i < totalObjects; i++) {
    const padded = String(offsets[i]).padStart(10, "0");
    pushStr(`${padded} 00000 n \n`);
  }

  pushStr(
    `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
