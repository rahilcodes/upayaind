"use client";
import * as React from "react";
import { Tooltip as T } from "radix-ui";

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={200}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            sideOffset={6}
            className="z-50 max-w-xs rounded-[var(--radius-md)] bg-ink px-3 py-2 text-[13px] leading-snug text-white shadow-lg"
          >
            {content}
            <T.Arrow className="fill-ink" />
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
