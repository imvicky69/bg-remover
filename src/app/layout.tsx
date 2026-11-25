import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
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
  title: "Free AI Background Remover — xweet bg",
  description:
    "100% Free AI Background Remover by xweet. Remove image backgrounds instantly on your device with WebGPU & WebAssembly. Zero uploads, zero watermarks, zero signups.",
  keywords: [
    "free ai background remover",
    "xweet bg",
    "bg.xweet.in",
    "remove background online free no watermark",
    "on-device background remover",
    "private background remover in browser",
    "transparent background maker",
    "ai cutout tool free",
    "remove bg free hd",
    "change photo background free",
  ],
  authors: [{ name: "xweet", url: "https://xweet.in" }],
  alternates: {
    canonical: "https://bg.xweet.in",
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
        url: "/logo-clear.png",
        width: 1381,
        height: 1139,
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
    images: ["/logo-clear.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#F0EFE6",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "xweet bg — Free AI Background Remover",
    url: "https://bg.xweet.in",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "All (Web Browser)",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description:
      "Free AI background removal tool that runs 100% locally on your device using WebGPU and WebAssembly. No file uploads, no watermarks.",
    featureList: [
      "100% On-Device AI Background Removal",
      "WebGPU & WebAssembly Acceleration",
      "No Watermarks, Signups, or Uploads",
      "Solid, Gradient, Blurred & Custom Image Backgrounds",
      "Studio Drop Shadow & Edge Feathering",
      "Manual Brush Touch-Up (Erase & Restore)",
      "PNG, WEBP & JPG Multi-Format Export",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Is xweet bg really free with no watermarks?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. xweet bg exports full-resolution PNG, WEBP, and JPG images with zero watermarks, zero daily limits, and no account required.",
        },
      },
      {
        "@type": "Question",
        name: "Do my photos get uploaded to a server?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Never. The AI model downloads to your browser once and runs entirely on your device using WebGPU or WebAssembly.",
        },
      },
      {
        "@type": "Question",
        name: "What image formats are supported?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "JPG, PNG, WEBP, HEIC/HEIF (iPhone photos), AVIF, GIF, BMP, and TIFF are all supported directly in the browser.",
        },
      },
    ],
  },
];

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
