"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { DropdownItem, DropdownLabel } from "@/components/ui/dropdown";
import { applyTheme, readTheme, THEMES, type Theme } from "@/lib/theme";

const ICONS: Record<Theme, React.ComponentType<{ className?: string }>> = { light: Sun, dark: Moon, system: Monitor };

/**
 * Light / Dark / System items for the account menu (every portal). The choice is
 * applied immediately (html[data-theme]) and remembered in the `theme` cookie +
 * localStorage, so the next server render boots in the right theme.
 */
export function ThemeMenuItems() {
  const t = useTranslations("common");
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => setTheme(readTheme()), []);
  return (
    <div role="group" aria-label={t("theme")}>
      <DropdownLabel>{t("theme")}</DropdownLabel>
      {THEMES.map((v) => {
        const Icon = ICONS[v];
        const active = theme === v;
        return (
          <DropdownItem
            key={v}
            role="menuitemradio"
            aria-checked={active}
            onSelect={(e) => {
              e.preventDefault();
              applyTheme(v);
              setTheme(v);
            }}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1">{t(`theme_${v}`)}</span>
            {active ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
          </DropdownItem>
        );
      })}
    </div>
  );
}
