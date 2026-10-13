"use client";
import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SwitchRow } from "@/components/student/tag-input";
import { useServerAction } from "@/components/portal/action-form";
import { setWhatsAppPrefAction } from "./actions";

/** WhatsApp opt-in toggle for /app/settings (DECISIONS D-133). Saves on change. */
export function WhatsAppPrefForm({ initial, phone, phoneValid, available }: { initial: boolean; phone: string | null; phoneValid: boolean; available: boolean }) {
  const t = useTranslations("student.settings.whatsapp");
  const [on, setOn] = React.useState(initial);
  const { run, pending } = useServerAction(setWhatsAppPrefAction);
  const disabled = pending || !phoneValid;
  return (
    <div className="grid gap-3">
      <SwitchRow
        id="pref-whatsapp"
        label={t("label")}
        hint={phoneValid ? t("hint", { phone: phone ?? "" }) : t("needsPhone")}
        checked={on}
        disabled={disabled}
        onChange={async (v) => {
          setOn(v);
          const r = await run(v);
          if (!r.ok) setOn(!v);
        }}
      />
      {!phoneValid ? (
        <Link href="/app/profile" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
          {t("addPhone")}
        </Link>
      ) : null}
      {!available ? <p className="text-[13px] text-muted-foreground">{t("notConfigured")}</p> : null}
    </div>
  );
}
