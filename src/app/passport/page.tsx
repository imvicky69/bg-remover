import type { Metadata } from "next";
import { PassportStudio } from "@/components/passport-studio";
import { EditorialSection } from "@/components/editorial-section";

export const metadata: Metadata = {
  title: "Free Passport Size Photo Maker — Auto Background & Print Sheet | xweet bg",
  description:
    "Create printable 35×45mm and 2×2 inch passport photos free on your device. Local AI removes the background, applies studio light backdrops, crops head & shoulders, and packs 4×6, A4, or Letter sheets without wasting paper.",
  keywords: [
    "free passport size photo maker",
    "passport photo maker online free",
    "35x45mm passport photo generator",
    "2x2 passport photo printable sheet",
    "4x6 passport photo layout maker",
    "a4 passport photo printable pdf",
    "indian passport photo maker free",
    "us passport photo 2x2 maker",
    "remove background passport photo",
    "xweet bg passport",
  ],
  alternates: {
    canonical: "https://bg.xweet.in/passport",
  },
  openGraph: {
    title: "Free Passport Size Photo Maker — Auto Background & Print Sheet | xweet bg",
    description:
      "100% on-device passport photo maker. Auto-removes background, adds clean studio white/blue backdrops, crops head & shoulders, and outputs zero-waste 300 DPI print sheets & PDFs.",
    url: "https://bg.xweet.in/passport",
    siteName: "xweet bg",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "xweet bg — Free Passport Size Photo Maker",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Passport Size Photo Maker — xweet bg",
    description:
      "Auto background removal, studio light backdrops, biometric crop, and zero-waste 4×6 / A4 print sheets running locally in your browser.",
    images: ["/og-image.png"],
  },
};

const passportJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "xweet bg Passport Size Photo Maker",
    url: "https://bg.xweet.in/passport",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "All (Web Browser)",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description:
      "Free on-device passport size photo maker. Removes backgrounds locally via WebGPU/WASM, applies studio light backdrops, crops head & shoulders, and generates zero-waste 300 DPI PDF, JPG, and PNG print sheets.",
    featureList: [
      "Local AI Background Removal (Zero Uploads)",
      "Customizable Light Studio Backdrops (White, Off-White, Light Gray, Ice Blue, Custom)",
      "Smart Biometric Head & Shoulders Auto-Crop",
      "35×45mm, 2×2 inch, 35×35mm, 33×48mm, 50×70mm & Custom Sizes",
      "Zero-Waste Sheet Packing on 4×6, A4, Letter, 5×7, and A5 Paper",
      "Exact-Scale 300 DPI PDF, JPG & PNG Export",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How does xweet bg pack passport photos without wasting paper?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "It evaluates portrait, landscape, and mixed-row guillotine shelf layouts for your chosen page size (4×6, A4, Letter, 5×7, A5) and packs the requested number of photos tightly so unused paper remains clean and reusable.",
        },
      },
      {
        "@type": "Question",
        name: "Which passport photo sizes are supported?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "35×45mm (India, UK, EU, Australia), 2×2 inch (US, OCI), 35×35mm, 33×48mm (China), 50×70mm (Canada), 25×35mm, and custom millimeter sizes.",
        },
      },
      {
        "@type": "Question",
        name: "Are my ID or passport portraits uploaded to any server?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Never. AI background removal, cropping, and 300 DPI PDF/image generation happen 100% locally in your browser.",
        },
      },
    ],
  },
];

export default function PassportPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(passportJsonLd) }}
      />
      <PassportStudio />
      <EditorialSection variant="passport" />
    </>
  );
}
