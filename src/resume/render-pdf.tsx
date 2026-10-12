import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ResumeData } from "./schema";
import { asTemplate, type RenderStyle } from "./styles";
import { ClassicTemplate } from "./templates/classic";
import { ModernTemplate } from "./templates/modern";
import { CompactTemplate } from "./templates/compact";
import type { TemplateProps } from "./templates/shared";

const TEMPLATES: Record<string, (p: TemplateProps) => React.ReactElement> = {
  classic: ClassicTemplate,
  modern: ModernTemplate,
  compact: CompactTemplate,
};

/** Number of pages in a PDF produced by react-pdf (page dictionaries are not compressed). */
export function countPdfPages(buf: Buffer): number {
  const m = buf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 0;
}

/** Render resume JSON to a PDF (server-side, < 1.5 s for typical resumes). */
export async function renderResumePdf(input: { resume: ResumeData; style: RenderStyle; template?: string | null; photo?: Buffer | null; title?: string }) {
  const Tpl = TEMPLATES[asTemplate(input.template)]!;
  const buffer = await renderToBuffer(<Tpl resume={input.resume} style={input.style} photo={input.photo} title={input.title} />);
  return { buffer: Buffer.from(buffer), pages: countPdfPages(Buffer.from(buffer)) };
}
