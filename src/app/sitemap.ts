import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: "https://bg.xweet.in",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://bg.xweet.in/passport",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];
}
