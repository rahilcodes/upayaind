import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  src,
  size = 40,
  className,
  tone = "accent",
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  tone?: "accent" | "ink" | "blue";
}) {
  const toneClass = { accent: "bg-accent text-accent-foreground", ink: "bg-ink text-white", blue: "bg-royal text-white" }[tone];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-bold", toneClass, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}
