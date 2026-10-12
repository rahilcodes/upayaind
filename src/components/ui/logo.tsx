import { cn } from "@/lib/utils";

/** The UpayaInd mark: a rising arrow (SPEC §13 motif). */
export function LogoMark({ size = 34, inverted = false, className }: { size?: number; inverted?: boolean; className?: string }) {
  const id = inverted ? "lg-inv" : "lg";
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0A35D6" />
          <stop offset="0.5" stopColor="#0A7CF0" />
          <stop offset="1" stopColor="#18B8F2" />
        </linearGradient>
      </defs>
      <rect width="34" height="34" rx="9" fill={inverted ? "#FFFFFF" : "#0B1846"} />
      <path d="M8 24 L14 18 L18 21 L26 11" fill="none" stroke={inverted ? "#0A35D6" : `url(#${id})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 11 H26 V17" fill="none" stroke={inverted ? "#0A7CF0" : "#18B8F2"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ inverted = false, className, size = 34 }: { inverted?: boolean; className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} inverted={inverted} />
      <span className={cn("font-display text-[22px] font-semibold tracking-[-0.01em]", inverted ? "text-white" : "text-ink")}>UpayaInd</span>
    </span>
  );
}
