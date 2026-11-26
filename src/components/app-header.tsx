"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scissors, IdCard } from "lucide-react";
import { useStudio } from "@/components/studio-provider";

export function AppHeader({ onResetCurrent }: { onResetCurrent?: () => void }) {
  const pathname = usePathname();
  const { offlineReady, reset } = useStudio();
  const isPassport = pathname.startsWith("/passport");

  return (
    <header className="mb-3 sm:mb-4 flex flex-wrap items-center justify-between gap-2.5">
      <Link
        href={isPassport ? "/passport" : "/"}
        onClick={() => {
          reset();
          onResetCurrent?.();
        }}
        className="inline-flex items-center gap-2 group"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-clear.png"
          alt="xweet bg"
          className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg object-contain"
        />
        <span className="font-space font-bold text-sm sm:text-base tracking-tight text-carbon">
          xweet{" "}
          <span className="px-1.5 py-0.5 rounded-md bg-signal-lime text-carbon text-[11px] font-mono">
            bg
          </span>
        </span>
      </Link>

      <div className="flex items-center gap-2">
        <nav
          aria-label="Workspace mode"
          className="inline-flex items-center rounded-xl border border-[#DDD9CC] bg-white/90 p-0.5 shadow-2xs"
        >
          <Link
            href="/"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1 text-xs font-semibold transition-all ${
              !isPassport
                ? "bg-carbon text-signal-lime shadow-2xs"
                : "text-terrain hover:text-carbon"
            }`}
          >
            <Scissors className="h-3.5 w-3.5" />
            <span>Cutout</span>
          </Link>
          <Link
            href="/passport"
            title="Passport Size Photo Maker"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1 text-xs font-semibold transition-all ${
              isPassport
                ? "bg-carbon text-signal-lime shadow-2xs"
                : "text-terrain hover:text-carbon"
            }`}
          >
            <IdCard className="h-3.5 w-3.5" />
            <span>Passport</span>
          </Link>
        </nav>

        {offlineReady && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[#E4E2D7] bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
            Ready Offline ✓
          </span>
        )}
      </div>
    </header>
  );
}
