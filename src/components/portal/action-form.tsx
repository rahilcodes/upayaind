"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Result = { ok: true; data?: unknown; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * Client helper for server actions that return ActionResult:
 * shows a toast, refreshes the route on success, exposes field errors.
 */
export function useServerAction<A extends unknown[]>(action: (...args: A) => Promise<Result>, opts: { successMessage?: string; refresh?: boolean; onSuccess?: (data: unknown) => void } = {}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[] | undefined>>({});
  const run = React.useCallback(
    (...args: A) =>
      new Promise<Result>((resolve) => {
        start(async () => {
          const r = await action(...args);
          if (r.ok) {
            setFieldErrors({});
            const msg = r.message ?? opts.successMessage;
            if (msg) toast.success(msg);
            if (opts.refresh !== false) router.refresh();
            opts.onSuccess?.(r.data);
          } else {
            setFieldErrors(r.fieldErrors ?? {});
            toast.error(r.error);
          }
          resolve(r);
        });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action, router],
  );
  return { run, pending, fieldErrors };
}
