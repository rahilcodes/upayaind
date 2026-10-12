"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "../actions";

export function ResendVerification({ label, done }: { label: string; done: string }) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  return (
    <Button
      variant="outline"
      size="lg"
      loading={pending}
      disabled={sent}
      onClick={() =>
        start(async () => {
          const r = await resendVerificationAction();
          if (r.ok) {
            setSent(true);
            toast.success(done);
          } else if (r.error) toast.error(r.error);
        })
      }
    >
      {sent ? done : label}
    </Button>
  );
}
