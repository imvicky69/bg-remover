export interface PassportSizePreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  region: string;
}

export interface PageSizePreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  defaultMarginMm: number;
  tag: string;
  isSingle?: boolean;
}

export interface PassportBackgroundPreset {
  id: string;
  name: string;
  color: string;
}

export type CutGuideStyle = "hairline" | "corners" | "none";
export type SheetAlignment = "compact" | "center";

export interface PlacedTile {
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  rotated: boolean;
}

export interface SheetPage {
  pageIndex: number;
  tiles: PlacedTile[];
  usedWmm: number;
  usedHmm: number;
  reusableRectMm: {
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
    areaPct: number;
  } | null;
}

export interface SheetPlan {
  sheetWmm: number;
  sheetHmm: number;
  orientation: "portrait" | "landscape" | "single";
  maxPerSheet: number;
  borderlessMaxPerSheet: number;
  pages: SheetPage[];
  totalPhotos: number;
  usedAreaPct: number;
  reusablePct: number;
  hasRotatedTiles: boolean;
  summaryLabel: string;
}

export const PASSPORT_SIZE_PRESETS: PassportSizePreset[] = [
  { id: "35x45", name: "35 × 45 mm", widthMm: 35, heightMm: 45, region: "IN · UK · EU · ICAO" },
  { id: "2x2", name: "2 × 2 in", widthMm: 50.8, heightMm: 50.8, region: "US · OCI · Visa" },
  { id: "35x35", name: "35 × 35 mm", widthMm: 35, heightMm: 35, region: "Square ID · PAN" },
  { id: "33x48", name: "33 × 48 mm", widthMm: 33, heightMm: 48, region: "China · Visa" },
  { id: "50x70", name: "50 × 70 mm", widthMm: 50, heightMm: 70, region: "Canada" },
  { id: "25x35", name: "25 × 35 mm", widthMm: 25, heightMm: 35, region: "Mini · Stamp" },
];

export const PAGE_SIZE_PRESETS: PageSizePreset[] = [
  { id: "4x6", name: "4 × 6 in", widthMm: 101.6, heightMm: 152.4, defaultMarginMm: 2.5, tag: "Photo Paper" },
  { id: "a4", name: "A4", widthMm: 210, heightMm: 297, defaultMarginMm: 5, tag: "210 × 297 mm" },
  { id: "letter", name: "Letter", widthMm: 215.9, heightMm: 279.4, defaultMarginMm: 5, tag: "8.5 × 11 in" },
  { id: "5x7", name: "5 × 7 in", widthMm: 127, heightMm: 177.8, defaultMarginMm: 3, tag: "Photo Card" },
  { id: "a5", name: "A5", widthMm: 148, heightMm: 210, defaultMarginMm: 4, tag: "Half A4" },
  { id: "6x8", name: "6 × 8 in", widthMm: 152.4, heightMm: 203.2, defaultMarginMm: 3, tag: "Lab Print" },
  { id: "single", name: "Single Photo", widthMm: 35, heightMm: 45, defaultMarginMm: 0, tag: "Digital 300 DPI", isSingle: true },
];

export const PASSPORT_BACKGROUND_PRESETS: PassportBackgroundPreset[] = [
  { id: "pure-white", name: "Pure White", color: "#FFFFFF" },
  { id: "studio-white", name: "Studio White", color: "#F4F6F9" },
  { id: "light-gray", name: "Light Gray", color: "#EAECEF" },
  { id: "ice-blue", name: "Ice Blue", color: "#E4EFFA" },
  { id: "studio-blue", name: "Sky Blue", color: "#CDE2F7" },
  { id: "warm-ivory", name: "Warm Ivory", color: "#FAF6EE" },
];

export function mmToPx(mm: number, dpi = 300): number {
  return Math.max(1, Math.round((mm / 25.4) * dpi));
}

interface CandidateLayout {
  sheetWmm: number;
  sheetHmm: number;
  orientation: "portrait" | "landscape";
  tiles: PlacedTile[];
  usedWmm: number;
  usedHmm: number;
  usableWmm: number;
  usableHmm: number;
  reusableRectMm: {
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
    areaPct: number;
  } | null;
  hasRotated: boolean;
  score: number;
}

function buildShelfCandidates(
  sheetWmm: number,
  sheetHmm: number,
  orientation: "portrait" | "landscape",
  photoWmm: number,
  photoHmm: number,
  marginMm: number,
  gapMm: number,
  targetCount: number,
  alignment: SheetAlignment,
  preferPortraitBonus: number
): CandidateLayout[] {
  const usableW = sheetWmm - 2 * marginMm;
  const usableH = sheetHmm - 2 * marginMm;
  if (usableW <= 0 || usableH <= 0) return [];

  const eps = 1e-6;
  const colsU = photoWmm <= usableW + eps ? Math.floor((usableW + gapMm + eps) / (photoWmm + gapMm)) : 0;
  const colsR = photoHmm <= usableW + eps ? Math.floor((usableW + gapMm + eps) / (photoHmm + gapMm)) : 0;

  const maxRowsU =
    colsU > 0 && photoHmm <= usableH + eps
      ? Math.floor((usableH + gapMm + eps) / (photoHmm + gapMm))
      : 0;
  const maxRowsR =
    colsR > 0 && photoWmm <= usableH + eps
      ? Math.floor((usableH + gapMm + eps) / (photoWmm + gapMm))
      : 0;

  const candidates: CandidateLayout[] = [];

  for (let ru = 0; ru <= maxRowsU; ru++) {
    for (let rr = 0; rr <= maxRowsR; rr++) {
      if (ru === 0 && rr === 0) continue;
      const totalRows = ru + rr;
      const totalH = ru * photoHmm + rr * photoWmm + (totalRows - 1) * gapMm;
      if (totalH > usableH + eps) continue;

      const cap = ru * colsU + rr * colsR;
      if (cap < targetCount) continue;

      // Test upright rows first, and also rotated rows first when mixed
      const orders: ("U-first" | "R-first")[] =
        ru > 0 && rr > 0 ? ["U-first", "R-first"] : ["U-first"];

      for (const order of orders) {
        const rowSpecs: { cols: number; w: number; h: number; rotated: boolean }[] = [];
        if (order === "U-first") {
          for (let i = 0; i < ru; i++) rowSpecs.push({ cols: colsU, w: photoWmm, h: photoHmm, rotated: false });
          for (let i = 0; i < rr; i++) rowSpecs.push({ cols: colsR, w: photoHmm, h: photoWmm, rotated: true });
        } else {
          for (let i = 0; i < rr; i++) rowSpecs.push({ cols: colsR, w: photoHmm, h: photoWmm, rotated: true });
          for (let i = 0; i < ru; i++) rowSpecs.push({ cols: colsU, w: photoWmm, h: photoHmm, rotated: false });
        }

        const tiles: PlacedTile[] = [];
        let curY = 0;
        let maxUsedW = 0;
        let actualUsedH = 0;
        let placedRotated = false;

        for (const row of rowSpecs) {
          if (tiles.length >= targetCount) break;
          const remaining = targetCount - tiles.length;
          const countInRow = Math.min(row.cols, remaining);
          for (let c = 0; c < countInRow; c++) {
            const xRel = c * (row.w + gapMm);
            tiles.push({
              xMm: xRel,
              yMm: curY,
              wMm: row.w,
              hMm: row.h,
              rotated: row.rotated,
            });
            if (row.rotated) placedRotated = true;
            maxUsedW = Math.max(maxUsedW, xRel + row.w);
          }
          actualUsedH = curY + row.h;
          curY += row.h + gapMm;
        }

        if (tiles.length < targetCount) continue;

        const offsetX =
          alignment === "center" ? Math.max(marginMm, (sheetWmm - maxUsedW) / 2) : marginMm;
        const offsetY =
          alignment === "center" ? Math.max(marginMm, (sheetHmm - actualUsedH) / 2) : marginMm;

        const shiftedTiles = tiles.map((t) => ({
          ...t,
          xMm: Number((t.xMm + offsetX).toFixed(3)),
          yMm: Number((t.yMm + offsetY).toFixed(3)),
        }));

        // Largest single clean rectangular offcut when compactly anchored
        const remRightW = Math.max(0, usableW - maxUsedW - gapMm);
        const remBottomH = Math.max(0, usableH - actualUsedH - gapMm);
        const rightArea = remRightW * usableH;
        const bottomArea = usableW * remBottomH;
        const maxCleanArea = Math.max(rightArea, bottomArea);
        const sheetArea = sheetWmm * sheetHmm;

        let reusableRectMm: CandidateLayout["reusableRectMm"] = null;
        if (alignment === "compact" && maxCleanArea / sheetArea >= 0.12) {
          if (bottomArea >= rightArea && remBottomH >= 12) {
            reusableRectMm = {
              xMm: marginMm,
              yMm: Number((marginMm + actualUsedH + gapMm).toFixed(2)),
              wMm: Number(usableW.toFixed(2)),
              hMm: Number(remBottomH.toFixed(2)),
              areaPct: Math.round((bottomArea / sheetArea) * 100),
            };
          } else if (remRightW >= 12) {
            reusableRectMm = {
              xMm: Number((marginMm + maxUsedW + gapMm).toFixed(2)),
              yMm: marginMm,
              wMm: Number(remRightW.toFixed(2)),
              hMm: Number(usableH.toFixed(2)),
              areaPct: Math.round((rightArea / sheetArea) * 100),
            };
          }
        }

        // Score: maximize remaining clean cut rectangle; mild preference for upright-only and natural sheet orientation
        const uprightBonus = placedRotated ? 0 : sheetArea * 0.045;
        const portraitBonus = orientation === "portrait" ? sheetArea * preferPortraitBonus : 0;
        const compactBoxPenalty = maxUsedW * actualUsedH * 0.08;
        const score = maxCleanArea + uprightBonus + portraitBonus - compactBoxPenalty;

        candidates.push({
          sheetWmm,
          sheetHmm,
          orientation,
          tiles: shiftedTiles,
          usedWmm: Number(maxUsedW.toFixed(2)),
          usedHmm: Number(actualUsedH.toFixed(2)),
          usableWmm: usableW,
          usableHmm: usableH,
          reusableRectMm,
          hasRotated: placedRotated,
          score,
        });
      }
    }
  }

  return candidates;
}

function getMaxCapacity(
  pageWmm: number,
  pageHmm: number,
  photoWmm: number,
  photoHmm: number,
  marginMm: number,
  gapMm: number
): number {
  const eps = 1e-6;
  const calc = (w: number, h: number) => {
    const uw = w - 2 * marginMm;
    const uh = h - 2 * marginMm;
    if (uw <= 0 || uh <= 0) return 0;
    const colsU = photoWmm <= uw + eps ? Math.floor((uw + gapMm + eps) / (photoWmm + gapMm)) : 0;
    const colsR = photoHmm <= uw + eps ? Math.floor((uw + gapMm + eps) / (photoHmm + gapMm)) : 0;
    const maxRowsU = colsU > 0 && photoHmm <= uh + eps ? Math.floor((uh + gapMm + eps) / (photoHmm + gapMm)) : 0;
    const maxRowsR = colsR > 0 && photoWmm <= uh + eps ? Math.floor((uh + gapMm + eps) / (photoWmm + gapMm)) : 0;
    let best = 0;
    for (let ru = 0; ru <= maxRowsU; ru++) {
      for (let rr = 0; rr <= maxRowsR; rr++) {
        if (ru === 0 && rr === 0) continue;
        const totalH = ru * photoHmm + rr * photoWmm + (ru + rr - 1) * gapMm;
        if (totalH <= uh + eps) {
          best = Math.max(best, ru * colsU + rr * colsR);
        }
      }
    }
    return best;
  };
  return Math.max(calc(pageWmm, pageHmm), calc(pageHmm, pageWmm));
}

export function computeOptimalSheetPlan(params: {
  pageWmm: number;
  pageHmm: number;
  photoWmm: number;
  photoHmm: number;
  requestedCount: number;
  marginMm: number;
  gapMm: number;
  alignment: SheetAlignment;
  isSinglePhoto?: boolean;
}): SheetPlan {
  const {
    pageWmm,
    pageHmm,
    photoWmm,
    photoHmm,
    requestedCount,
    marginMm,
    gapMm,
    alignment,
    isSinglePhoto = false,
  } = params;

  if (isSinglePhoto) {
    return {
      sheetWmm: photoWmm,
      sheetHmm: photoHmm,
      orientation: "single",
      maxPerSheet: 1,
      borderlessMaxPerSheet: 1,
      pages: [
        {
          pageIndex: 0,
          tiles: [{ xMm: 0, yMm: 0, wMm: photoWmm, hMm: photoHmm, rotated: false }],
          usedWmm: photoWmm,
          usedHmm: photoHmm,
          reusableRectMm: null,
        },
      ],
      totalPhotos: 1,
      usedAreaPct: 100,
      reusablePct: 0,
      hasRotatedTiles: false,
      summaryLabel: `Single ${photoWmm} × ${photoHmm} mm · 300 DPI`,
    };
  }

  const maxPerSheet = getMaxCapacity(pageWmm, pageHmm, photoWmm, photoHmm, marginMm, gapMm);
  const borderlessMaxPerSheet = getMaxCapacity(pageWmm, pageHmm, photoWmm, photoHmm, 0, 0);

  if (maxPerSheet <= 0) {
    // Photo is larger than the selected paper
    return {
      sheetWmm: pageWmm,
      sheetHmm: pageHmm,
      orientation: "portrait",
      maxPerSheet: 0,
      borderlessMaxPerSheet,
      pages: [{ pageIndex: 0, tiles: [], usedWmm: 0, usedHmm: 0, reusableRectMm: null }],
      totalPhotos: 0,
      usedAreaPct: 0,
      reusablePct: 100,
      hasRotatedTiles: false,
      summaryLabel: "Photo exceeds page dimensions",
    };
  }

  const count = Math.max(1, Math.round(requestedCount));
  const isLargeOfficeSheet = Math.min(pageWmm, pageHmm) >= 145;
  const preferPortraitBonus = isLargeOfficeSheet ? 0.025 : 0.005;

  // Determine the best sheet orientation using the fuller page (first page) so multi-page PDFs have consistent page size
  const firstPageTarget = Math.min(count, maxPerSheet);
  const firstCandidates = [
    ...buildShelfCandidates(
      pageWmm,
      pageHmm,
      "portrait",
      photoWmm,
      photoHmm,
      marginMm,
      gapMm,
      firstPageTarget,
      alignment,
      preferPortraitBonus
    ),
    ...(Math.abs(pageWmm - pageHmm) > 0.5
      ? buildShelfCandidates(
          pageHmm,
          pageWmm,
          "landscape",
          photoWmm,
          photoHmm,
          marginMm,
          gapMm,
          firstPageTarget,
          alignment,
          preferPortraitBonus
        )
      : []),
  ];

  // If count > maxPerSheet, bias first page toward whichever orientation achieves maxPerSheet
  const sortedFirst = firstCandidates.sort((a, b) => b.score - a.score);
  const bestFirst = sortedFirst[0];

  const chosenW = bestFirst.sheetWmm;
  const chosenH = bestFirst.sheetHmm;
  const chosenOrientation = bestFirst.orientation;

  const pages: SheetPage[] = [];
  let remaining = count;
  let pageIdx = 0;

  while (remaining > 0) {
    const batch = Math.min(remaining, maxPerSheet);
    let pageBest: CandidateLayout | undefined;

    if (pageIdx === 0 && batch === firstPageTarget) {
      pageBest = bestFirst;
    } else {
      const sameOri = buildShelfCandidates(
        chosenW,
        chosenH,
        chosenOrientation,
        photoWmm,
        photoHmm,
        marginMm,
        gapMm,
        batch,
        alignment,
        0
      ).sort((a, b) => b.score - a.score);

      pageBest = sameOri[0];
      if (!pageBest) {
        const altOri = buildShelfCandidates(
          chosenH,
          chosenW,
          chosenOrientation === "portrait" ? "landscape" : "portrait",
          photoWmm,
          photoHmm,
          marginMm,
          gapMm,
          batch,
          alignment,
          0
        ).sort((a, b) => b.score - a.score);
        pageBest = altOri[0];
      }
    }

    if (!pageBest) break;

    pages.push({
      pageIndex: pageIdx,
      tiles: pageBest.tiles,
      usedWmm: pageBest.usedWmm,
      usedHmm: pageBest.usedHmm,
      reusableRectMm: pageBest.reusableRectMm,
    });

    remaining -= batch;
    pageIdx++;
  }

  const totalPlaced = pages.reduce((acc, p) => acc + p.tiles.length, 0);
  const singleSheetArea = chosenW * chosenH;
  const totalPhotoArea = totalPlaced * photoWmm * photoHmm;
  const totalSheetArea = pages.length * singleSheetArea;
  const usedAreaPct = totalSheetArea > 0 ? Math.min(100, Math.round((totalPhotoArea / totalSheetArea) * 100)) : 0;
  const lastPageReusable = pages[pages.length - 1]?.reusableRectMm?.areaPct ?? 0;
  const hasRotatedTiles = pages.some((p) => p.tiles.some((t) => t.rotated));

  const oriLabel =
    Math.abs(chosenW - chosenH) < 0.5
      ? "Square"
      : chosenW > chosenH
      ? "Landscape"
      : "Portrait";

  const summaryLabel =
    pages.length === 1
      ? `${oriLabel} · ${totalPlaced} photo${totalPlaced === 1 ? "" : "s"} · ${
          lastPageReusable >= 15
            ? `${lastPageReusable}% clean offcut saved`
            : `${usedAreaPct}% sheet fill`
        }`
      : `${oriLabel} · ${totalPlaced} photos across ${pages.length} pages`;

  return {
    sheetWmm: chosenW,
    sheetHmm: chosenH,
    orientation: chosenOrientation,
    maxPerSheet,
    borderlessMaxPerSheet,
    pages,
    totalPhotos: totalPlaced,
    usedAreaPct,
    reusablePct: lastPageReusable,
    hasRotatedTiles,
    summaryLabel,
  };
}
