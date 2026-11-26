"use client";

import React from "react";
import Link from "next/link";
import { ArrowUp, ArrowUpRight } from "lucide-react";

export function BgFooter() {
  const scrollToTop = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <footer className="w-full border-t border-terrain/25 bg-paper text-carbon mt-14 relative overflow-hidden">
      {/* 1. Ecosystem Explore CTA Strip */}
      <div className="border-b border-terrain/20 bg-white/40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-xl space-y-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-terrain font-semibold flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-signal-lime ring-1 ring-carbon/20" />
                <span>A Xweet App · Ecosystem</span>
              </span>
              <h2 className="font-space text-2xl sm:text-3xl font-bold tracking-tight text-carbon leading-tight">
                Explore more free, fast &amp; privacy-first apps.
              </h2>
              <p className="text-xs sm:text-sm text-terrain leading-relaxed">
                From local PDF &amp; image tools to 4K wallpapers, ad-free Android apps, and
                minimalist games — discover the full collection at{" "}
                <a
                  href="https://xweet.in/apps"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-carbon underline underline-offset-4 hover:opacity-75"
                >
                  xweet.in/apps
                </a>
                .
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <a
                href="https://xweet.in/apps"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-signal-lime hover:bg-[#cbf056] text-carbon font-semibold text-xs px-5 py-2.5 border border-carbon/15 transition-colors shadow-2xs"
              >
                <span>Explore xweet.in/apps</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>

              <nav className="flex items-center gap-3.5 text-xs font-mono text-terrain">
                <Link href="/" className="hover:text-carbon transition-colors">
                  Cutout
                </Link>
                <Link href="/passport" className="hover:text-carbon transition-colors">
                  Passport
                </Link>
                <a
                  href="https://xweet.in/about"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-carbon transition-colors"
                >
                  About
                </a>
              </nav>

              <button
                type="button"
                onClick={scrollToTop}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-white/75 hover:bg-white text-carbon font-mono text-[11px] font-medium border border-terrain/30 hover:border-carbon rounded-full transition-all cursor-pointer active:scale-[0.98]"
              >
                <span>TOP</span>
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Massive Minimalist Architectural Sign-off */}
      <div className="w-full overflow-hidden select-none pointer-events-none -my-3 sm:-my-6 flex justify-center">
        <span className="font-space text-[20vw] sm:text-[17vw] font-bold tracking-tighter text-carbon/[0.05] leading-none whitespace-nowrap uppercase">
          XWEET
        </span>
      </div>

      {/* 3. Bottom Hairline Strip */}
      <div className="border-t border-terrain/20 bg-white/45 relative z-10">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4 text-[11px] font-mono text-terrain">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/favicon.png"
              alt="xweet bg"
              className="h-5 w-5 rounded-full border border-terrain/30 bg-white p-0.5 object-contain"
            />
            <span className="font-semibold text-carbon tracking-wide">xweet bg</span>
            <span className="text-terrain/40">•</span>
            <span>A Xweet App</span>
            <span className="text-terrain/40">•</span>
            <span>© 2026</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://xweet.in/apps"
              target="_blank"
              rel="noreferrer"
              className="hover:text-carbon transition-colors"
            >
              xweet.in/apps
            </a>
            <span className="text-terrain/40">•</span>
            <a
              href="https://github.com/imvicky69/bg-remover"
              target="_blank"
              rel="noreferrer"
              className="hover:text-carbon transition-colors"
            >
              GitHub
            </a>
            <span className="text-terrain/40">•</span>
            <a
              href="https://instagram.com/xweet_69"
              target="_blank"
              rel="noreferrer"
              className="hover:text-carbon transition-colors"
            >
              @xweet_69
            </a>
            <span className="text-terrain/40">•</span>
            <span>100% Client-Side AI</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
