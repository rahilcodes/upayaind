import { useTranslations } from "next-intl";
import type { Rag } from "@/server/services/admin-metrics";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Small presentational pieces shared by the admin pages (server-compatible). */

export function LoadBar({ active, max, label, className }: { active: number; max: number; label: string; className?: string }) {
  const full = max > 0 && active >= max;
  const tone = max === 0 ? "grey" : full ? "red" : active / max >= 0.8 ? "amber" : "brand";
  return (
    <div className={cn("min-w-[120px]", className)}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
        <span className="tabular font-semibold">
          {active}
          <span className="font-normal text-muted-foreground"> / {max}</span>
        </span>
        {full ? <span className="text-[12px] font-semibold text-danger">{label}</span> : null}
      </div>
      <Progress value={active} max={Math.max(1, max)} label={`${active} / ${max}`} tone={tone} />
    </div>
  );
}

const RAG_TONE: Record<Rag, "green" | "green-solid" | "amber" | "red" | "grey"> = { done: "green-solid", green: "green", amber: "amber", red: "red", off: "grey" };

export function RagBadge({ rag }: { rag: Rag }) {
  const t = useTranslations("rag");
  return (
    <Badge tone={RAG_TONE[rag]} dot>
      {t(rag)}
    </Badge>
  );
}

export function TodayProgress({ applied, target, rag }: { applied: number; target: number; rag: Rag }) {
  const tone = rag === "red" ? "red" : rag === "amber" ? "amber" : rag === "off" ? "grey" : rag === "done" ? "green" : "brand";
  return (
    <div className="min-w-[96px]">
      <p className="tabular text-[13px] font-semibold">
        {applied}
        <span className="font-normal text-muted-foreground"> / {target}</span>
      </p>
      <Progress className="mt-1 h-1.5" value={applied} max={Math.max(1, target)} label={`${applied} / ${target}`} tone={tone} />
    </div>
  );
}

export function Section({ title, description, actions, children, className, id }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} className={cn("rounded-[18px] border border-border bg-surface", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-[17px] font-bold">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function KeyValue({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[13px] text-muted-foreground">{i.label}</dt>
          <dd className="break-words text-[15px] font-medium">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Chips({ items, empty = "—" }: { items: string[]; empty?: string }) {
  if (!items.length) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <Badge key={x} tone="grey">
          {x}
        </Badge>
      ))}
    </span>
  );
}
