"use client";
import * as React from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Chips input for short lists (job titles, locations, companies). Enter or
 * comma adds; Backspace on an empty field removes the last chip. Accessible:
 * the list is announced and each chip has a labelled remove button.
 */
export function TagInput({
  id,
  value,
  onChange,
  max,
  placeholder,
  suggestions,
  invalid,
  describedBy,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
  placeholder?: string;
  suggestions?: readonly string[];
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("student.common");
  const [draft, setDraft] = React.useState("");
  const full = max !== undefined && value.length >= max;
  const listId = `${id}-suggestions`;

  function add(raw: string) {
    const v = raw.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!v || full) return;
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, v]);
    setDraft("");
  }

  return (
    <div
      className={cn(
        "flex min-h-12 w-full flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] border-[1.5px] border-border-strong bg-surface px-2 py-1.5 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring",
        invalid && "border-danger",
      )}
    >
      {value.length ? (
        <ul className="contents" aria-label={t("selected")}>
          {value.map((v) => (
            <li key={v} className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent py-1 pl-3 pr-1 text-sm font-medium text-accent-foreground">
              <span className="truncate">{v}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-primary/10"
                aria-label={t("removeItem", { item: v })}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={id}
        value={draft}
        disabled={full}
        list={suggestions?.length ? listId : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) {
            v.split(",").slice(0, -1).forEach(add);
            setDraft(v.split(",").pop() ?? "");
          } else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        placeholder={full ? t("maxReached", { max: max ?? 0 }) : placeholder}
        className="h-9 min-w-[10rem] flex-1 bg-transparent px-1.5 text-[15px] outline-none placeholder:text-subtle-foreground/80 disabled:cursor-not-allowed"
      />
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

/** Toggle chips for multi-select enums (work modes, employment types). */
export function ChoiceChips<T extends string>({
  name,
  options,
  value,
  onChange,
  labels,
  multiple = true,
  legend,
  error,
}: {
  name: string;
  options: readonly T[];
  value: T[];
  onChange: (v: T[]) => void;
  labels: (v: T) => string;
  multiple?: boolean;
  legend: string;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <label
              key={o}
              className={cn(
                "inline-flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-full border-[1.5px] px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring",
                on ? "border-primary bg-accent text-accent-foreground" : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                className="sr-only"
                checked={on}
                onChange={() => onChange(multiple ? (on ? value.filter((x) => x !== o) : [...value, o]) : [o])}
              />
              {on ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              ) : null}
              {labels(o)}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={`${name}-error`} role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** A labelled on/off switch row (role="switch"). */
export function SwitchRow({ id, label, hint, checked, onChange, disabled }: { id: string; label: React.ReactNode; hint?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[15px] font-semibold">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-primary" : "bg-border-strong",
        )}
      >
        <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
    </div>
  );
}
