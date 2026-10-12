import { ImageResponse } from "next/og";
import { CompassIcon } from "@/lib/branding/app-icon";
export function GET() {
  return new ImageResponse(<CompassIcon />, {
    width: 512,
    height: 512,
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
