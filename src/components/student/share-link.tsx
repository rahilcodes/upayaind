"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Mail, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Referral link with copy / WhatsApp / email / native share buttons (D-113). */
export function ShareLink({ link, code }: { link: string; code: string }) {
  const t = useTranslations("student.referrals.share");
  const [copied, setCopied] = React.useState(false);
  const [canShare, setCanShare] = React.useState(false);
  React.useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  const message = t("message", { link });

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  async function share() {
    try {
      await navigator.share({ title: t("subject"), text: message, url: link });
    } catch {}
  }

  return (
    <div className="mt-4">
      <label htmlFor="referral-link" className="sr-only">
        {t("label")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="referral-link"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 flex-1 rounded-[12px] border border-white/30 bg-white/10 px-3 text-[15px] text-white placeholder:text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        />
        <Button type="button" onClick={copy} className="bg-white text-royal hover:bg-[#EAF1FE]">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-[#E3ECFF]">{t("code", { code })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-white/40 px-4 text-sm font-semibold text-white hover:bg-white/10"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {t("whatsapp")}
        </a>
        <a
          href={`mailto:?subject=${encodeURIComponent(t("subject"))}&body=${encodeURIComponent(message)}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-white/40 px-4 text-sm font-semibold text-white hover:bg-white/10"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          {t("email")}
        </a>
        {canShare ? (
          <button type="button" onClick={share} className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-white/40 px-4 text-sm font-semibold text-white hover:bg-white/10">
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {t("more")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
