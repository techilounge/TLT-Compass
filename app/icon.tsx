import { ImageResponse } from "next/og";
import { CompassIcon } from "@/lib/branding/app-icon";
export const size = { width: 192, height: 192 };
export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(<CompassIcon />, size);
}
