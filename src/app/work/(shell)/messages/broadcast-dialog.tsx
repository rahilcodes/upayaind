"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea, fieldA11y } from "@/components/ui/input";
import { useServerAction } from "@/components/portal/action-form";
import { broadcastAction } from "./actions";

export function BroadcastDialog({ count }: { count: number }) {
  const t = useTranslations("messaging.broadcast");
  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState("");
  const { run, pending, fieldErrors } = useServerAction(broadcastAction, {
    onSuccess: () => {
      setOpen(false);
      setBody("");
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!count}>
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("title")} description={t("description", { count })}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(body);
          }}
          className="grid gap-4"
        >
          <Field id="bc-body" label={t("label")} hint={t("hint")} error={fieldErrors.body}>
            <Textarea {...fieldA11y("bc-body", fieldErrors.body, true)} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required rows={6} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={!body.trim()}>
              {t("send", { count })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
