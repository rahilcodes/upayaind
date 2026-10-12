"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LogOut, User as UserIcon, LayoutGrid } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { logoutAction } from "@/app/(auth)/actions";

export function UserMenu({
  name,
  subtitle,
  profileHref,
  switchTo,
}: {
  name: string;
  subtitle: string;
  profileHref: string;
  switchTo?: { href: string; label: string }[];
}) {
  const t = useTranslations("common");
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button type="button" className="flex min-h-11 items-center gap-2.5 rounded-[12px] px-1.5 hover:bg-surface-muted" aria-label={`${name} — account menu`}>
          <Avatar name={name} size={36} tone="blue" />
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-semibold leading-tight">{name}</span>
            <span className="block text-xs text-muted-foreground">{subtitle}</span>
          </span>
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>{name}</DropdownLabel>
        <DropdownItem asChild>
          <Link href={profileHref}>
            <UserIcon className="h-4 w-4" aria-hidden="true" />
            {t("profile")}
          </Link>
        </DropdownItem>
        {switchTo?.map((s) => (
          <DropdownItem asChild key={s.href}>
            <Link href={s.href}>
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              {s.label}
            </Link>
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem
          onSelect={(e) => {
            e.preventDefault();
            logoutAction();
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t("logout")}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
