"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { useServerAction } from "@/components/portal/action-form";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea, fieldA11y } from "@/components/ui/input";

type Result = { ok: true; data?: unknown; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * Button → confirmation dialog (optionally with a required reason) → server action.
 * `action` receives the reason (or "" when no reason is asked).
 */
export function ConfirmAction({
  trigger,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerLabel,
  title,
  description,
  confirmLabel,
  confirmVariant = "danger",
  reasonLabel,
  reasonHint,
  action,
  children,
}: {
  trigger: React.ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerLabel?: string;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonProps["variant"];
  reasonLabel?: string;
  reasonHint?: string;
  action: (reason: string) => Promise<Result>;
  children?: React.ReactNode;
}) {
  const tc = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(action, { onSuccess: () => setOpen(false) });
  const id = React.useId().replace(/:/g, "");
  const needsReason = Boolean(reasonLabel);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setReason("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} aria-label={triggerLabel}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(reason.trim());
          }}
        >
          {children}
          {needsReason ? (
            <Field id={`r-${id}`} label={reasonLabel} hint={reasonHint} error={fieldErrors.reason ?? fieldErrors.note}>
              <Textarea {...fieldA11y(`r-${id}`, fieldErrors.reason, Boolean(reasonHint))} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-20" required />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" variant={confirmVariant} loading={pending} disabled={needsReason && reason.trim().length < 3}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
