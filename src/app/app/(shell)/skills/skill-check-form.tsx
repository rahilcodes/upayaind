"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { answerSkillCheckAction } from "./actions";

type Level = "have" | "basic" | "no";
type Item = { skill: string; jobs: number; required: boolean };

/** One row per skill with three answers. Only answered rows are sent; the rest stay pending. */
export function SkillCheckForm({ items }: { items: Item[] }) {
  const t = useTranslations("student.skills");
  const router = useRouter();
  const [answers, setAnswers] = React.useState<Record<string, Level>>({});
  const { run, pending } = useServerAction(answerSkillCheckAction, { onSuccess: () => { setAnswers({}); router.refresh(); } });
  const count = Object.keys(answers).length;
  const options: { level: Level; label: string; on: string }[] = [
    { level: "have", label: t("have"), on: "border-success bg-[#E6F4EC] text-[#1E7B4F]" },
    { level: "basic", label: t("basic"), on: "border-primary bg-accent text-accent-foreground" },
    { level: "no", label: t("no"), on: "border-border-strong bg-surface-muted text-foreground" },
  ];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(Object.entries(answers).map(([skill, level]) => ({ skill, level })));
      }}
    >
      <p className="mb-4 rounded-[14px] border border-border bg-surface-muted/50 px-4 py-3 text-sm text-muted-foreground">{t("honesty")}</p>
      <ul className="grid gap-2.5">
        {items.map((it) => (
          <li key={it.skill} className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold">{it.skill}</p>
              <p className="text-[12.5px] text-muted-foreground">{t("askedIn", { count: it.jobs })}{it.required ? ` · ${t("required")}` : ""}</p>
            </div>
            <div role="radiogroup" aria-label={t("answerFor", { skill: it.skill })} className="flex flex-wrap gap-1.5">
              {options.map((o) => {
                const active = answers[it.skill] === o.level;
                return (
                  <button
                    key={o.level}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setAnswers((cur) => {
                      const next = { ...cur };
                      if (active) delete next[it.skill];
                      else next[it.skill] = o.level;
                      return next;
                    })}
                    className={cn("min-h-11 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors", active ? o.on : "border-border bg-surface text-muted-foreground hover:text-foreground")}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-3 mt-5 flex items-center justify-between gap-3 rounded-[14px] border border-border bg-surface px-4 py-3 shadow-[0_10px_30px_-18px_rgba(11,24,70,0.35)]">
        <span className="text-sm text-muted-foreground">{t("answered", { count, total: items.length })}</span>
        <Button type="submit" loading={pending} disabled={!count}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
