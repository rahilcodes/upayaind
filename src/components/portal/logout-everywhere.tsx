"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/** "Log out of all devices" (D-124): bumps the session version, which ends every session including this one. */
export function LogoutEverywhereButton({ action }: { action: () => Promise<void> }) {
  const t = useTranslations("work.twofa");
  const [pending, start] = React.useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border p-3.5 text-sm">
      <div>
        <p className="font-semibold">{t("logoutAllTitle")}</p>
        <p className="text-muted-foreground">{t("logoutAllBody")}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={pending}
        onClick={() => {
          if (window.confirm(t("logoutAllConfirm"))) start(() => action());
        }}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {t("logoutAll")}
      </Button>
    </div>
  );
}
