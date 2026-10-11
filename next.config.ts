import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/workspace/*/exports/*": ["./assets/fonts/DejaVuSans.ttf"],
    "/workspace/*/calendar/pdf/**": [
      "./scripts/pdf-calendar-child.mjs",
      "./node_modules/unpdf/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
