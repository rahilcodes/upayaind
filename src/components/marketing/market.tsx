import { DEFAULT_MARKET } from "./data";

/**
 * Market variants without dynamic rendering (DECISIONS D-0xx).
 *
 * Reading the `market` cookie in a Server Component would make every
 * marketing page dynamic. Instead each market-specific block is rendered once
 * per ACTIVE market inside <MarketVariant code="…">, and a 300-byte inline
 * script copies the cookie (set by middleware from ?market= / geo) onto
 * #mk-root[data-market] before first paint. Generated CSS then hides the
 * other markets' variants. No client JS bundle, no layout shift, pages stay
 * SSG/ISR. Without JS the default market is shown.
 */

const attr = (c: string) => c.replace(/[^A-Z]/g, "");

export function MarketScript({ codes }: { codes: string[] }) {
  const list = JSON.stringify(codes.map(attr));
  const js = `(function(){try{var a=${list},r=document.getElementById("mk-root"),q=new URLSearchParams(location.search).get("market"),m=(q||(document.cookie.match(/(?:^|; )market=([^;]+)/)||[])[1]||"").toUpperCase();if(m==="GB")m="UK";r.setAttribute("data-market",a.indexOf(m)>-1?m:"${attr(DEFAULT_MARKET)}")}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

export function MarketStyle({ codes }: { codes: string[] }) {
  const all = codes.map(attr);
  const fallback = all.includes(DEFAULT_MARKET) ? DEFAULT_MARKET : all[0] ?? DEFAULT_MARKET;
  const rules = [
    `#mk-root:not([data-market]) [data-mk]:not([data-mk="${fallback}"])`,
    ...all.map((c) => `#mk-root[data-market="${c}"] [data-mk]:not([data-mk="${c}"])`),
  ];
  return <style>{`${rules.join(",")}{display:none!important}[data-mk].mk-contents{display:contents}`}</style>;
}

/** One market's version of a block. Use `as="span"` inside inline content. */
export function MarketVariant({ code, as = "div", children }: { code: string; as?: "div" | "span"; children: React.ReactNode }) {
  const Tag = as;
  return (
    <Tag data-mk={attr(code)} className="mk-contents">
      {children}
    </Tag>
  );
}

/** Render `render(item)` once per market (only wraps when there is more than one). */
export function PerMarket<T extends { code: string }>({ items, as, children }: { items: T[]; as?: "div" | "span"; children: (item: T) => React.ReactNode }) {
  if (items.length <= 1) return <>{items[0] ? children(items[0]) : null}</>;
  return (
    <>
      {items.map((m) => (
        <MarketVariant key={m.code} code={m.code} as={as}>
          {children(m)}
        </MarketVariant>
      ))}
    </>
  );
}

/**
 * Pin the chrome (header switcher, footer phone) to one market on a country
 * homepage (D-141), regardless of the visitor's cookie. Runs before paint,
 * after MarketScript, so /uk always shows the UK phone and "Current" marker.
 */
export function MarketPin({ code }: { code: string }) {
  const js = `(function(){try{document.getElementById("mk-root").setAttribute("data-market","${attr(code)}")}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
