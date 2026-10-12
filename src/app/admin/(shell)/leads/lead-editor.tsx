"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/input";
import { updateLeadAction } from "./actions";

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"] as const;

/** Inline lead editor: status, owner, next follow-up, and an appended note. */
export function LeadEditor({ lead, owners, meId }: { lead: { id: string; status: string; ownerId: string | null; nextFollowUpAt: string | null }; owners: { id: string; name: string }[]; meId: string }) {
  const t = useTranslations("admin.leads");
  const tc = useTranslations("admin.common");
  const [status, setStatus] = React.useState(lead.status);
  const [owner, setOwner] = React.useState(lead.ownerId ?? "");
  const [next, setNext] = React.useState(lead.nextFollowUpAt ?? "");
  const [note, setNote] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(updateLeadAction, { onSuccess: () => setNote("") });
  const dirty = status !== lead.status || owner !== (lead.ownerId ?? "") || next !== (lead.nextFollowUpAt ?? "") || note.trim().length > 0;
  const id = lead.id;
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        run({ id, status: status as (typeof STATUSES)[number], ownerId: owner || null, nextFollowUpAt: next || null, note: note.trim() || null });
      }}
    >
      <Field id={`st-${id}`} label={t("status")}>
        <Select id={`st-${id}`} value={status} onChange={(e) => setStatus(e.target.value)} className="h-11">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`ow-${id}`} label={t("owner")} error={fieldErrors.ownerId}>
        <Select {...fieldA11y(`ow-${id}`, fieldErrors.ownerId)} value={owner} onChange={(e) => setOwner(e.target.value)} className="h-11">
          <option value="">{tc("unassigned")}</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id === meId ? t("me", { name: o.name }) : o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`nx-${id}`} label={t("nextFollowUp")} error={fieldErrors.nextFollowUpAt}>
        <Input {...fieldA11y(`nx-${id}`, fieldErrors.nextFollowUpAt)} type="date" value={next} onChange={(e) => setNext(e.target.value)} className="h-11" />
      </Field>
      <Field id={`nt-${id}`} label={t("addNote")} className="sm:col-span-3">
        <Textarea id={`nt-${id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className="min-h-16" placeholder={t("notePlaceholder")} />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" size="sm" loading={pending} disabled={!dirty}>
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}
