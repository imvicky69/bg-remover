import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { StudioProvider } from "@/components/studio-provider";
import { BgFooter } from "@/components/bg-footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://bg.xweet.in"),
  title: "Free AI Background Remover & Passport Photo Maker — xweet bg",
  description:
    "100% Free AI Background Remover and Passport Size Photo Maker by xweet. Remove backgrounds locally with WebGPU & WASM, apply light studio backdrops, and pack 35×45mm or 2×2 in print sheets without watermarks.",
  keywords: [
    "free ai background remover",
    "passport size photo maker",
    "free passport photo maker online",
    "xweet bg",
    "bg.xweet.in",
    "remove background online free no watermark",
    "on-device background remover",
    "35x45mm passport photo maker",
    "2x2 passport photo printable sheet",
    "change photo background free",
  ],
  authors: [{ name: "xweet", url: "https://xweet.in" }],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", type: "image/png" },
    ],
    apple: "/favicon.png",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "Free AI Background Remover — xweet bg",
    description:
      "Remove backgrounds from any photo in seconds with AI. 100% private, runs entirely on your device with no uploads or watermarks.",
    url: "https://bg.xweet.in",
    siteName: "xweet bg",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "xweet bg — Free AI Background Remover",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Background Remover — xweet bg",
    description:
      "100% private AI background removal running on your device. No uploads, no watermarks.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#F0EFE6",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-paper text-carbon font-geist antialiased selection:bg-signal-lime selection:text-carbon flex flex-col">
        <StudioProvider>
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-3 sm:pt-4 pb-6 flex flex-col">
            {children}
          </main>
          <BgFooter />
        </StudioProvider>
      </body>
    </html>
  );
}
