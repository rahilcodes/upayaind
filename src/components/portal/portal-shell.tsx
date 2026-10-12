import { getTranslations } from "next-intl/server";
import type { Role } from "@/generated/prisma/enums";
import { Avatar } from "@/components/ui/avatar";
import { MobileNav, Sidebar, type Badges } from "./sidebar";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { adminNavFor, STUDENT_NAV, WORK_NAV } from "./nav-config";

/**
 * Shared shell for /app, /work and /admin (SPEC M1): ink sidebar from the
 * approved design, top bar with notifications and account menu, responsive
 * sheet navigation under 1024px. `.portal` scopes system dark mode.
 */
export async function PortalShell({
  portal,
  user,
  badges = {},
  subtitle,
  children,
  topbarExtra,
}: {
  portal: "app" | "work" | "admin";
  user: { name: string; role: Role };
  badges?: Badges;
  subtitle?: string;
  children: React.ReactNode;
  topbarExtra?: React.ReactNode;
}) {
  const t = await getTranslations();
  const items = portal === "app" ? STUDENT_NAV : portal === "work" ? WORK_NAV : adminNavFor(user.role);
  const root = `/${portal}`;
  const roleLabel = subtitle ?? t(`role.${user.role}`);
  const switchTo =
    portal === "work" && (user.role === "MANAGER" || user.role === "ADMIN")
      ? [{ href: "/admin", label: t("nav.adminPortal") }]
      : portal === "admin"
        ? [{ href: "/work", label: t("nav.workPortal") }]
        : undefined;

  const footer = (
    <div className="flex items-center gap-3 rounded-[12px] bg-ink-800 p-3">
      <Avatar name={user.name} size={40} tone="blue" />
      <div className="min-w-0">
        <p className="truncate font-semibold">{user.name}</p>
        <p className="truncate text-[13px] text-[#B9C3E3]">{roleLabel}</p>
      </div>
    </div>
  );

  return (
    <div className="portal flex min-h-dvh bg-canvas text-foreground">
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {t("common.skipToContent")}
      </a>
      <Sidebar items={items} root={root} badges={badges} footer={footer} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-canvas/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <MobileNav items={items} root={root} badges={badges} footer={footer} />
          <div className="flex-1">{topbarExtra}</div>
          <NotificationBell />
          <UserMenu name={user.name} subtitle={roleLabel} profileHref={`${root}/${portal === "admin" ? "settings" : "profile"}`} switchTo={switchTo} />
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em] sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}
