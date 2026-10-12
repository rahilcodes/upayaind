"use client";
import * as React from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { openPortalAction } from "./actions";

export function PortalButton({ label, ...props }: { label: string } & ButtonProps) {
  const [pending, start] = React.useTransition();
  const [going, setGoing] = React.useState(false);
  return (
    <Button
      {...props}
      loading={pending || going}
      onClick={() =>
        start(async () => {
          const r = await openPortalAction();
          if (r.ok) {
            setGoing(true);
            window.location.assign(r.data.url);
          } else toast.error(r.error);
        })
      }
    >
      {label}
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
