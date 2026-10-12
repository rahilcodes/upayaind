"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/components/portal/action-form";
import { bookMockAction, cancelMockAction } from "@/app/app/(shell)/prep/actions";

export function BookMockButton({ slotId, label }: { slotId: string; label: string }) {
  const t = useTranslations("student.prep");
  const { run, pending } = useServerAction(bookMockAction);
  return (
    <Button type="button" size="sm" loading={pending} onClick={() => run(slotId)} aria-label={label}>
      {t("book")}
    </Button>
  );
}

export function CancelMockButton({ mockId }: { mockId: string }) {
  const t = useTranslations("student.prep");
  const { run, pending } = useServerAction(cancelMockAction);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() => {
        if (window.confirm(t("cancelConfirm"))) run(mockId);
      }}
    >
      {t("cancel")}
    </Button>
  );
}
