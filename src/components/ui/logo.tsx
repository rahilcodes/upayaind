import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Official UpayaInd logo (client HD artwork, public/brand/upayaind-logo.png, 1382×516).
 * The artwork is blue on transparent, so on dark or blue backgrounds pass
 * `onDark` and it is placed on a white pill to stay legible.
 * Replace the PNG with an SVG/hi-res export when the client supplies one.
 */
const RATIO = 1382 / 516;

export function Logo({
  height = 40,
  onDark = false,
  className,
  priority = false,
}: {
  height?: number;
  onDark?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const img = (
    <Image
      src="/brand/upayaind-logo.png"
      alt="UpayaInd"
      width={Math.round(height * RATIO)}
      height={height}
      priority={priority}
      className="h-auto select-none"
      style={{ width: Math.round(height * RATIO), height }}
    />
  );
  if (!onDark) return <span className={cn("inline-flex items-center", className)}>{img}</span>;
  return <span className={cn("inline-flex items-center rounded-[12px] bg-white px-2.5 py-1.5 shadow-sm", className)}>{img}</span>;
}

/** The logo's figure-and-swoosh mark alone (icons, avatars, compact spaces). */
export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <Image src="/brand/upayaind-mark.png" alt="" aria-hidden="true" width={size} height={size} className={cn("select-none", className)} style={{ width: size, height: size }} />
  );
}
