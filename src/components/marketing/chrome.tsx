import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import type { MarketInfo } from "./data";
import { PerMarket } from "./market";
import { MarketMenu, MobileMenu } from "./menus";
import { trackAttrs } from "./track";
import { container } from "./ui";

function Brand({ height = 44 }: { height?: number }) {
  return <Logo height={height} priority />;
}

export function whatsappHref(number: string, text: string) {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export async function SiteHeader({ markets }: { markets: MarketInfo[] }) {
  const t = await getTranslations("marketing");
  const links = [
    { href: "/how-it-works", label: t("nav.howItWorks") },
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/success-stories", label: t("nav.stories") },
    { href: "/about", label: t("nav.about") },
    { href: "/blog", label: t("nav.blog") },
  ];
  const marketButton = (
    <PerMarket items={markets} as="span">
      {(m) => (
        <span>
          <span className="sr-only">{t("market.button", { country: m.name })} </span>
          <span aria-hidden="true">{t("market.short", { code: m.code, currency: m.currency })}</span>
        </span>
      )}
    </PerMarket>
  );
  const switcher = (
    <MarketMenu
      button={marketButton}
      title={t("market.title")}
      currentLabel={t("market.current")}
      items={markets.map((m) => ({ code: m.code, label: `${m.name} · ${m.currency}` }))}
    />
  );

  return (
    <header className="relative z-30 border-b border-sand bg-paper">
      <div className={cn(container, "flex items-center gap-4 px-4 py-4 sm:px-6 lg:gap-6")}>
        <Link href="/" aria-label={t("nav.home")} className="rounded-md">
          <Brand />
        </Link>
        <nav aria-label={t("nav.mainNav")} className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-7 text-[15px] font-medium">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-11 items-center text-ink no-underline hover:text-royal">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3 lg:ml-0">
          <div className="hidden sm:block">{switcher}</div>
          <Link href="/login" className="hidden h-11 items-center rounded-[10px] border-[1.5px] border-royal bg-white px-5 text-[15px] font-semibold text-royal no-underline hover:bg-[#EAF1FE] lg:inline-flex">
            {t("nav.login")}
          </Link>
          <Link
            href="/pricing"
            {...trackAttrs("cta_get_started", { location: "header" })}
            className="hidden h-11 items-center rounded-[10px] bg-royal px-5 text-[15px] font-semibold text-white no-underline hover:bg-royal-600 hover:text-white sm:inline-flex"
          >
            {t("nav.getStarted")}
          </Link>
          <MobileMenu links={[...links, { href: "/faq", label: t("nav.faq") }, { href: "/contact", label: t("nav.contact") }]} labels={{ open: t("nav.openMenu"), close: t("nav.closeMenu"), nav: t("nav.mainNav") }}>
            <Link
              href="/pricing"
              {...trackAttrs("cta_get_started", { location: "mobile_menu" })}
              className="inline-flex min-h-[52px] items-center justify-center rounded-[12px] bg-royal text-base font-semibold text-white no-underline"
            >
              {t("nav.getStarted")}
            </Link>
            <Link href="/login" className="inline-flex min-h-[52px] items-center justify-center rounded-[12px] border-[1.5px] border-royal text-base font-semibold text-royal no-underline">
              {t("nav.login")}
            </Link>
            <div className="sm:hidden">{switcher}</div>
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter({ markets, legal }: { markets: MarketInfo[]; legal: Set<string> }) {
  const t = await getTranslations("marketing");
  const linkCls = "inline-flex min-h-11 items-center text-[#3E4A6E] no-underline hover:text-royal sm:min-h-9";
  const legalLinks = (["privacy", "terms", "refund", "guarantee", "cookies"] as const)
    .map((slug) => ({ slug, label: t(`footer.legalLinks.${slug}`) }))
    .filter((l) => legal.has(l.slug));
  return (
    <footer className="bg-paper px-4 pb-10 pt-16 sm:px-6">
      <div className={cn(container, "grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4")}>
        <div className="col-span-2 md:col-span-1">
          <div className="mb-3"><Brand height={40} /></div>
          <p className="max-w-[300px] text-[15px] text-[#3E4A6E]">{t("footer.about")}</p>
        </div>
        <nav aria-label={t("footer.product")} className="flex flex-col gap-1 text-[15px]">
          <p className="mb-1 font-bold">{t("footer.product")}</p>
          <Link className={linkCls} href="/how-it-works">{t("nav.howItWorks")}</Link>
          <Link className={linkCls} href="/pricing">{t("nav.pricing")}</Link>
          <Link className={linkCls} href="/success-stories">{t("nav.stories")}</Link>
          <Link className={linkCls} href="/faq">{t("nav.faq")}</Link>
        </nav>
        <nav aria-label={t("footer.company")} className="flex flex-col gap-1 text-[15px]">
          <p className="mb-1 font-bold">{t("footer.company")}</p>
          <Link className={linkCls} href="/about">{t("nav.about")}</Link>
          <Link className={linkCls} href="/blog">{t("nav.blog")}</Link>
          <Link className={linkCls} href="/contact">{t("nav.contact")}</Link>
          <Link className={linkCls} href="/login">{t("nav.login")}</Link>
        </nav>
        <nav aria-label={t("footer.legal")} className="flex flex-col gap-1 text-[15px]">
          <p className="mb-1 font-bold">{t("footer.legal")}</p>
          {legalLinks.map((l) => (
            <Link key={l.slug} className={linkCls} href={`/legal/${l.slug}`}>
              {l.label}
            </Link>
          ))}
          <button type="button" data-consent-open="" className={cn(linkCls, "cursor-pointer bg-transparent p-0 text-left")}>
            {t("footer.cookieSettings")}
          </button>
        </nav>
      </div>
      <div className={cn(container, "mt-10 flex flex-col gap-4 border-t border-sand pt-6 text-sm text-[#5A6585] sm:flex-row sm:items-center sm:justify-between")}>
        <span>{t("footer.copyright")}</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <MarketMenu
            up
            button={<span>{t("market.title")}</span>}
            title={t("market.title")}
            currentLabel={t("market.current")}
            items={markets.map((m) => ({ code: m.code, label: `${m.name} · ${m.currency}` }))}
          />
          <PerMarket items={markets} as="span">
            {(m) => (
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{t("footer.market", { country: m.name })}</span>
                {m.phoneDisplay ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <a href={`tel:${m.phoneDisplay.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center text-[#3E4A6E] hover:text-royal sm:min-h-0">
                      {m.phoneDisplay}
                    </a>
                  </>
                ) : null}
                {m.whatsapp ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <a href={whatsappHref(m.whatsapp, t("contact.whatsappText"))} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[#3E4A6E] hover:text-royal sm:min-h-0">
                      {t("footer.whatsapp")}
                    </a>
                  </>
                ) : null}
              </span>
            )}
          </PerMarket>
        </div>
      </div>
    </footer>
  );
}
