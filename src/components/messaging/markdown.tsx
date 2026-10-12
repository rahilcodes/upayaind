import * as React from "react";
import { parseMarkdownLite, type MdNode } from "./markdown-lite";

function render(nodes: MdNode[], key = "n"): React.ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}-${i}`;
    if (n.t === "text") return <React.Fragment key={k}>{n.v}</React.Fragment>;
    if (n.t === "br") return <br key={k} />;
    if (n.t === "strong") return <strong key={k}>{render(n.c, k)}</strong>;
    if (n.t === "em") return <em key={k}>{render(n.c, k)}</em>;
    return (
      <a key={k} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-2">
        {render(n.c, k)}
      </a>
    );
  });
}

/** Safe markdown-lite renderer (React elements only, no raw HTML). */
export function MarkdownLite({ text }: { text: string }) {
  return <>{render(parseMarkdownLite(text))}</>;
}
