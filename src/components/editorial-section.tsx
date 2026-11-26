"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const CUTOUT_FAQ = [
  {
    q: "Why does the first image take a few seconds?",
    a: "Your browser downloads the quantized open-source AI model (~44 MB) once and caches it locally. Every image after that runs near-instantly offline.",
  },
  {
    q: "How does Studio Editor work without scrolling?",
    a: "Click Studio Editor in the top action bar to open a compact side-by-side workspace with Backdrop, Ratio, Polish, and Brush tools right beside your live canvas.",
  },
  {
    q: "Are my photos ever uploaded to a server?",
    a: "Never. Background segmentation runs 100% locally inside your browser sandbox via WebGPU or WebAssembly.",
  },
  {
    q: "Does it support iPhone HEIC and high-res photos?",
    a: "Yes. HEIC and HEIF files decode directly in your browser alongside JPG, PNG, WEBP, and AVIF — with zero watermarks or daily caps.",
  },
];

const PASSPORT_FAQ = [
  {
    q: "How does the sheet packer avoid wasting paper?",
    a: "It evaluates portrait, landscape, and mixed-row guillotine shelf layouts for your chosen paper (4×6, A4, Letter, 5×7, A5) and packs partial sheets tightly so the remaining paper stays uncut and reusable.",
  },
  {
    q: "Which passport photo sizes and countries are supported?",
    a: "Built-in presets cover 35×45 mm (India, UK, EU, Australia, ICAO), 2×2 in (US, OCI, Indian Visa), 35×35 mm, 33×48 mm (China), 50×70 mm (Canada), 25×35 mm, plus any custom millimeter dimensions.",
  },
  {
    q: "Why export a PDF instead of only JPG/PNG?",
    a: "Our 300 DPI PDF embeds exact physical millimeter dimensions so home and office printers output true 35×45 mm or 2×2 inch photos at 1:1 scale without browser auto-scaling errors.",
  },
  {
    q: "Are my ID or passport portraits stored anywhere?",
    a: "No. Everything—AI background removal, studio backdrop fill, biometric cropping, and 300 DPI PDF generation—runs strictly offline inside your browser.",
  },
];

export function EditorialSection({ variant }: { variant: "cutout" | "passport" }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const faqs = variant === "passport" ? PASSPORT_FAQ : CUTOUT_FAQ;

  return (
    <section className="mt-14 pt-10 border-t border-[#DCD9CC] space-y-10">
      {/* Architectural Hairline Spec Ledger */}
      <div className="rounded-2xl border border-[#DDD9CC] bg-[#FAF9F4] grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#E4E2D7] overflow-hidden">
        {variant === "cutout" ? (
          <>
            <div className="p-5 sm:p-6 flex flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-terrain">
                  01 · Local Runtime
                </p>
                <h2 className="font-space font-bold text-base text-carbon">
                  Zero server uploads
                </h2>
                <p className="text-xs text-terrain leading-relaxed">
                  Quantized BRIA RMBG-1.4 runs inside your browser via WebGPU or WebAssembly. Your
                  photos never leave your hardware.
                </p>
              </div>
              <p className="font-mono text-[11px] text-carbon/70">
                HEIC · AVIF · WEBP · PNG · JPG
              </p>
            </div>

            <div className="p-5 sm:p-6 flex flex-col justify-between gap-4 bg-white/50">
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-terrain">
                  02 · Passport Studio
                </p>
                <h2 className="font-space font-bold text-base text-carbon">
                  Biometric crop &amp; print fit
                </h2>
                <p className="text-xs text-terrain leading-relaxed">
                  Dedicated passport photo workspace: studio light backdrops, auto head-and-shoulders
                  crop, and zero-waste 4×6 or A4 print sheets.
                </p>
              </div>
              <Link
                href="/passport"
                className="inline-flex items-center gap-1 text-xs font-bold text-carbon hover:opacity-75 w-fit"
              >
                <span>Open Passport Maker</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="p-5 sm:p-6 flex flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-terrain">
                  03 · Studio Export
                </p>
                <h2 className="font-space font-bold text-base text-carbon">
                  Full resolution, no watermarks
                </h2>
                <p className="text-xs text-terrain leading-relaxed">
                  Edit backdrops, aspect ratios, de-fringed hair edges, and manual touch-ups side by
                  side—export PNG, WEBP, or JPG unlimited times.
                </p>
              </div>
              <p className="font-mono text-[11px] text-carbon/70">
                Alpha PNG · Studio Canvas · Offline PWA
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="p-5 sm:p-6 flex flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-terrain">
                  01 · Standard Dimensions
                </p>
                <h2 className="font-space font-bold text-base text-carbon">
                  Global passport &amp; visa sizes
                </h2>
                <p className="text-xs text-terrain leading-relaxed">
                  Supports 35×45 mm (India, UK, EU, Schengen), 2×2 inch (US, OCI), 35×35 mm, 33×48 mm,
                  50×70 mm, and custom millimeter formats.
                </p>
              </div>
              <p className="font-mono text-[11px] text-carbon/70">
                35×45 MM · 2×2 IN · CUSTOM MM
              </p>
            </div>

            <div className="p-5 sm:p-6 flex flex-col justify-between gap-4 bg-white/50">
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-terrain">
                  02 · Zero-Waste Packing
                </p>
                <h2 className="font-space font-bold text-base text-carbon">
                  Best page fit on any sheet
                </h2>
                <p className="text-xs text-terrain leading-relaxed">
                  Automatically picks portrait, landscape, or mixed-row layouts on 4×6, A4, Letter,
                  5×7, or A5 paper—leaving unused sheet areas clean and reusable.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-xs font-bold text-carbon hover:opacity-75 w-fit"
              >
                <span>Back to BG Cutout Studio</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="p-5 sm:p-6 flex flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-terrain">
                  03 · Print-Exact 300 DPI
                </p>
                <h2 className="font-space font-bold text-base text-carbon">
                  1:1 PDF, JPG &amp; single photo
                </h2>
                <p className="text-xs text-terrain leading-relaxed">
                  Export exact-millimeter PDFs for direct 100% printing, 300 DPI JPG/PNG sheets for
                  photo kiosks, or single digital portraits for online portals.
                </p>
              </div>
              <p className="font-mono text-[11px] text-carbon/70">
                1:1 SCALE PDF · 300 DPI · ON-DEVICE
              </p>
            </div>
          </>
        )}
      </div>

      {/* Minimal Hairline Accordion FAQ */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-4 space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-terrain">
            Reference
          </p>
          <h2 className="font-space font-bold text-lg text-carbon tracking-tight">
            {variant === "passport" ? "Passport photo FAQ" : "Common questions"}
          </h2>
          <p className="text-xs text-terrain leading-relaxed">
            Private, offline-capable, and deterministic. Zero accounts or telemetry.
          </p>
        </div>

        <div className="md:col-span-8 border-y border-[#DCD9CC] divide-y divide-[#E4E2D7]">
          {faqs.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full py-3.5 flex items-center justify-between gap-4 text-left cursor-pointer group"
                >
                  <span className="text-xs sm:text-sm font-semibold text-carbon group-hover:opacity-80">
                    {item.q}
                  </span>
                  <span className="font-mono text-sm text-terrain shrink-0 w-5 text-right">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && (
                  <p className="pb-4 pr-6 text-xs text-terrain leading-relaxed">{item.a}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
