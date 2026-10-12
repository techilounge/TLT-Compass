import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TLT Compass",
    short_name: "TLT Compass",
    description:
      "Guided Teen Leadership Training, supervised records and club planning.",
    start_url: "/workspace",
    scope: "/",
    display: "standalone",
    background_color: "#faf9f7",
    theme_color: "#ad1d39",
    icons: [
      { src: "/icon", sizes: "192x192", type: "image/png", purpose: "any" },
      {
        src: "/app-icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
