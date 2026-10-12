"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { track } from "@/components/marketing/track";
import { contactAction, type ContactState } from "./actions";

type Copy = Record<
  "name" | "email" | "phone" | "phoneHint" | "phoneCountry" | "market" | "message" | "messageHint" | "send" | "sending" | "sentTitle" | "sentBody" | "sendAnother" | "honeypot",
  string
>;

const input =
  "w-full rounded-[10px] border-[1.5px] border-[#D5DAE6] bg-white px-3.5 text-[15px] text-ink placeholder:text-[#5A6585] focus:border-royal focus:outline-none focus:ring-[3px] focus:ring-[rgba(37, 99, 222,0.35)] aria-[invalid=true]:border-danger";

function Err({ id, msg }: { id: string; msg?: string[] }) {
  return msg?.[0] ? (
    <p id={`${id}-error`} role="alert" className="text-[13px] font-medium text-danger">
      {msg[0]}
    </p>
  ) : null;
}

function Submit({ copy }: { copy: Copy }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="inline-flex min-h-[52px] items-center justify-center rounded-[12px] bg-royal px-7 text-base font-semibold text-white hover:bg-royal-600 disabled:opacity-60"
    >
      {pending ? copy.sending : copy.send}
    </button>
  );
}

export function ContactForm({
  copy,
  consent,
  markets,
  dialCodes,
}: {
  copy: Copy;
  consent: React.ReactNode;
  markets: { code: string; name: string }[];
  dialCodes: { code: string; label: string }[];
}) {
  const [state, action] = useActionState<ContactState, FormData>(contactAction, {});
  const [key, setKey] = useState(0);
  const [market, setMarket] = useState("");
  const [utm, setUtm] = useState("");
  const status = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const m = document.getElementById("mk-root")?.getAttribute("data-market") ?? "";
    setMarket(m);
    setUtm(location.search.slice(1, 1000));
  }, []);
  useEffect(() => {
    if (state.ok) {
      track("contact_submitted");
      status.current?.focus();
    }
  }, [state]);

  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const a11y = (id: string, hint?: boolean) => ({
    id,
    name: id,
    "aria-invalid": fe[id]?.length ? true : undefined,
    "aria-describedby": fe[id]?.length ? `${id}-error` : hint ? `${id}-hint` : undefined,
  });

  if (state.ok) {
    return (
      <div ref={status} tabIndex={-1} role="status" className="rounded-[16px] border border-[#BFE3CF] bg-[#E6F4EC] p-6 text-[#155C3A] focus:outline-none">
        <p className="text-lg font-bold">{copy.sentTitle}</p>
        <p className="mt-1.5">{copy.sentBody}</p>
        <button type="button" onClick={() => location.reload()} className="mt-4 inline-flex min-h-11 items-center font-semibold text-[#155C3A] underline underline-offset-4">
          {copy.sendAnother}
        </button>
      </div>
    );
  }

  const defaultMarket = v.market || market || markets[0]?.code || "US";
  return (
    <form key={key} action={action} noValidate className="flex flex-col gap-5" onReset={() => setKey((k) => k + 1)}>
      {state.error && !Object.values(state.fieldErrors ?? {}).some((v) => v?.length) ? (
        <div role="alert" className="rounded-[10px] border border-[#F3C8C3] bg-[#FCEAE8] px-4 py-3 text-sm text-[#8E231B]">
          {state.error}
        </div>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-sm font-semibold">
            {copy.name}
          </label>
          <input {...a11y("name")} defaultValue={v.name} autoComplete="name" required className={`${input} h-12`} />
          <Err id="name" msg={fe.name} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-semibold">
            {copy.email}
          </label>
          <input {...a11y("email")} type="email" defaultValue={v.email} autoComplete="email" inputMode="email" required className={`${input} h-12`} />
          <Err id="email" msg={fe.email} />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{copy.phone}</legend>
          <div className="flex gap-2">
            <label htmlFor="phoneCountry" className="sr-only">
              {copy.phoneCountry}
            </label>
            <select id="phoneCountry" name="phoneCountry" key={`pc-${defaultMarket}`} defaultValue={v.phoneCountry || defaultMarket} autoComplete="tel-country-code" className={`${input} h-12 !w-[112px] flex-none appearance-none pr-2`}>
              {dialCodes.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
            <input {...a11y("phone", true)} aria-label={copy.phone} type="tel" defaultValue={v.phone} autoComplete="tel-national" inputMode="tel" className={`${input} h-12 min-w-0 flex-1`} />
          </div>
          {fe.phone?.length ? (
            <Err id="phone" msg={fe.phone} />
          ) : (
            <p id="phone-hint" className="text-[13px] text-[#4A5578]">
              {copy.phoneHint}
            </p>
          )}
        </fieldset>
        <div className="flex flex-col gap-2">
          <label htmlFor="market" className="text-sm font-semibold">
            {copy.market}
          </label>
          <select {...a11y("market")} key={`m-${defaultMarket}`} defaultValue={defaultMarket} autoComplete="country" className={`${input} h-12`}>
            {markets.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
          <Err id="market" msg={fe.market} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="message" className="text-sm font-semibold">
          {copy.message}
        </label>
        <textarea {...a11y("message", true)} defaultValue={v.message} required minLength={10} rows={5} className={`${input} min-h-32 py-3 leading-relaxed`} />
        {fe.message?.length ? (
          <Err id="message" msg={fe.message} />
        ) : (
          <p id="message-hint" className="text-[13px] text-[#4A5578]">
            {copy.messageHint}
          </p>
        )}
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">{copy.honeypot}</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <input type="hidden" name="utm" value={utm} />
      <div className="flex flex-col gap-1.5">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-[#3E4A6E]">
          <input
            type="checkbox"
            id="consent"
            name="consent"
            defaultChecked={v.consent === "on"}
            aria-invalid={fe.consent?.length ? true : undefined}
            aria-describedby={fe.consent?.length ? "consent-error" : undefined}
            className="mt-0.5 h-[18px] w-[18px] flex-none cursor-pointer accent-[#2563DE]"
          />
          <span>{consent}</span>
        </label>
        <Err id="consent" msg={fe.consent} />
      </div>
      <div>
        <Submit copy={copy} />
      </div>
    </form>
  );
}
