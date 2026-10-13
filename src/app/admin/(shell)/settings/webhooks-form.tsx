"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Send, Trash2 } from "lucide-react";
import { useServerAction } from "@/components/portal/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, fieldA11y } from "@/components/ui/input";
import type { AlertWebhook } from "@/server/services/alerts";
import { saveAlertWebhooksAction, sendTestAlertAction } from "./actions";

const EVENTS = ["new_lead", "offer_hired", "payment_failed", "awaiting_assignment", "below_target", "new_signup_payment"] as const;
type EventKey = (typeof EVENTS)[number];

const newId = () => `wh_${Math.random().toString(36).slice(2, 10)}`;

/** Outgoing Slack/Teams-compatible webhook alerts (D-122). */
export function WebhooksForm({ value }: { value: AlertWebhook[] }) {
  const t = useTranslations("admin.settings.webhooks");
  const tc = useTranslations("admin.common");
  const [hooks, setHooks] = React.useState<AlertWebhook[]>(value);
  const { run, pending, fieldErrors } = useServerAction(saveAlertWebhooksAction);
  const test = useServerAction(sendTestAlertAction, { refresh: false });
  const [testing, setTesting] = React.useState<string | null>(null);
  const dirty = JSON.stringify(hooks) !== JSON.stringify(value);

  const update = (id: string, patch: Partial<AlertWebhook>) => setHooks((h) => h.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const errFor = (i: number) => fieldErrors[`${i}.url`] ?? fieldErrors[`[${i}].url`];

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(hooks.map((h) => ({ ...h, url: h.url.trim(), label: h.label.trim() })));
      }}
    >
      {hooks.length ? (
        <ul className="grid gap-3">
          {hooks.map((h, i) => (
            <li key={h.id} className="grid gap-3 rounded-[14px] border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <Field id={`wh-${h.id}-label`} label={t("label")}>
                  <Input {...fieldA11y(`wh-${h.id}-label`)} value={h.label} onChange={(e) => update(h.id, { label: e.target.value })} maxLength={60} placeholder={t("labelPlaceholder")} />
                </Field>
                <Field id={`wh-${h.id}-url`} label={t("url")} error={errFor(i)}>
                  <Input {...fieldA11y(`wh-${h.id}-url`, errFor(i))} type="url" value={h.url} onChange={(e) => update(h.id, { url: e.target.value })} maxLength={500} placeholder="https://hooks.slack.com/services/…" required />
                </Field>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold">{t("events")}</legend>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {EVENTS.map((ev) => (
                    <label key={ev} className="flex min-h-10 items-center gap-2.5 text-sm">
                      <Checkbox
                        checked={h.events.includes(ev)}
                        onChange={(e) => update(h.id, { events: e.target.checked ? [...h.events, ev] : h.events.filter((x) => x !== ev) })}
                      />
                      {t(`event.${ev as EventKey}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-10 items-center gap-2.5 text-sm">
                  <Checkbox checked={h.enabled} onChange={(e) => update(h.id, { enabled: e.target.checked })} />
                  {t("enabled")}
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!h.url.trim()}
                    loading={test.pending && testing === h.id}
                    onClick={async () => {
                      setTesting(h.id);
                      await test.run(h.url.trim());
                      setTesting(null);
                    }}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {t("sendTest")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setHooks((x) => x.filter((y) => y.id !== h.id))} aria-label={t("removeFor", { label: h.label || h.url || t("untitled") })}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {t("remove")}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={hooks.length >= 10} onClick={() => setHooks((x) => [...x, { id: newId(), url: "", label: "", events: [...EVENTS], enabled: true }])}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("add")}
        </Button>
        <Button type="submit" size="sm" loading={pending} disabled={!dirty}>
          {tc("saveChanges")}
        </Button>
      </div>
    </form>
  );
}
