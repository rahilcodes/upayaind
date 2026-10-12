"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3, Briefcase, Building2, Calendar, Clock, CreditCard, FileText, GraduationCap, Globe, Home, Inbox, KeyRound, List,
  Menu, MessageSquare, Palette, PenSquare, Plane, Settings, Shield, Shuffle, Sun, Tag, User, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { Sheet } from "@/components/ui/dialog";
import type { NavIcon, NavItem } from "./nav-config";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  home: Home, list: List, building: Building2, calendar: Calendar, file: FileText, message: MessageSquare, graduation: GraduationCap,
  user: User, key: KeyRound, card: CreditCard, settings: Settings, sun: Sun, users: Users, clock: Clock, plane: Plane, chart: BarChart3,
  shuffle: Shuffle, tag: Tag, globe: Globe, palette: Palette, inbox: Inbox, pen: PenSquare, shield: Shield, briefcase: Briefcase,
};

export type Badges = Partial<Record<NonNullable<NavItem["badgeKey"]>, number>>;

function isActive(pathname: string, href: string, root: string) {
  if (href === root) return pathname === root;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ items, root, badges, onNavigate }: { items: NavItem[]; root: string; badges: Badges; onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  let lastGroup: string | undefined;
  return (
    <nav aria-label={t("mainNav")} className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href, root);
        const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
        const groupHeader = item.group && item.group !== lastGroup && lastGroup !== undefined ? item.group : null;
        lastGroup = item.group ?? lastGroup;
        return (
          <React.Fragment key={item.href}>
            {groupHeader ? (
              <p className="mb-1 mt-4 px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#7F8BB5]">{t(`groups.${groupHeader}` as "groups.work")}</p>
            ) : null}
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium transition-colors",
                active ? "bg-sidebar-active text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden="true" />
              <span className="flex-1 truncate">{t(item.label as "dashboard")}</span>
              {badge ? (
                <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-sky px-1.5 text-xs font-bold text-ink">
                  {badge > 99 ? "99+" : badge}
                  <span className="sr-only"> new</span>
                </span>
              ) : null}
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export function Sidebar({
  items,
  root,
  badges,
  footer,
  extra,
}: {
  items: NavItem[];
  root: string;
  badges: Badges;
  footer: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-7 overflow-y-auto bg-sidebar px-4 py-6 text-white lg:flex">
      <Link href={root} className="px-2" aria-label="UpayaInd home">
        <Logo inverted size={32} className="[&_span]:text-[20px]" />
      </Link>
      <NavList items={items} root={root} badges={badges} />
      {extra}
      <div className="mt-auto">{footer}</div>
    </aside>
  );
}

export function MobileNav({ items, root, badges, footer, extra }: { items: NavItem[]; root: string; badges: Badges; footer: React.ReactNode; extra?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const t = useTranslations("common");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openMenu")}
        aria-expanded={open}
        className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] border border-border bg-surface text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Menu" className="flex flex-col gap-7 bg-sidebar px-4 py-6 text-white">
        <Link href={root} onClick={() => setOpen(false)} className="px-2">
          <Logo inverted size={32} />
        </Link>
        <NavList items={items} root={root} badges={badges} onNavigate={() => setOpen(false)} />
        {extra}
        <div className="mt-auto">{footer}</div>
      </Sheet>
    </>
  );
}
