import type { Metadata } from "next";
import { CutoutStudio } from "@/components/cutout-studio";
import { EditorialSection } from "@/components/editorial-section";

export const metadata: Metadata = {
  title: "Free AI Background Remover & Passport Photo Maker — xweet bg",
  description:
    "100% Free AI Background Remover and Passport Size Photo Maker running locally on your device via WebGPU & WebAssembly. Zero uploads, zero watermarks, and zero-waste 300 DPI print sheets.",
  alternates: {
    canonical: "https://bg.xweet.in",
  },
};

const cutoutJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "xweet bg — Free AI Background Remover & Passport Photo Maker",
    url: "https://bg.xweet.in",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "All (Web Browser)",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description:
      "Free on-device AI background remover and passport size photo maker running 100% locally via WebGPU and WebAssembly. No file uploads, no watermarks.",
    featureList: [
      "100% On-Device AI Background Removal",
      "Dedicated Passport Size Photo Maker (bg.xweet.in/passport)",
      "Auto Light Studio Backdrops & Smart Head-Shoulders Crop",
      "Zero-Waste Sheet Packing (4×6, A4, Letter, 5×7, A5) & 300 DPI PDF Export",
      "WebGPU & WebAssembly Acceleration",
      "Manual Brush Touch-Up (Erase & Restore)",
      "PNG, WEBP, JPG & HEIC Support",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Can I also make printable passport size photos with xweet bg?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Open the Passport Photo Maker at bg.xweet.in/passport to auto-remove backgrounds, apply light studio backdrops, crop head and shoulders (35×45 mm, 2×2 in, or custom), and pack any number of photos onto 4×6, A4, or Letter print sheets without wasting paper.",
        },
      },
      {
        "@type": "Question",
        name: "Do my photos or IDs get uploaded to a server?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Never. The AI model runs locally inside your browser sandbox via WebGPU or WebAssembly.",
        },
      },
      {
        "@type": "Question",
        name: "Are there any watermarks, signups, or daily limits?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. All transparent PNG, WEBP, JPG, and 300 DPI PDF exports are 100% free with zero watermarks.",
        },
      },
      {
        "@type": "Question",
        name: "Does it work with iPhone HEIC photos?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. HEIC and HEIF files decode directly in your browser alongside JPG, PNG, WEBP, and AVIF.",
        },
      },
    ],
  },
];

export default function XweetBgPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(cutoutJsonLd) }}
      />
      <CutoutStudio />
      <EditorialSection variant="cutout" />
    </>
  );
}
