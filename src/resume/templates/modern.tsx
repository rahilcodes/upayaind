import { ResumeDocument, type TemplateProps, type Theme } from "./shared";

/** Modern: left-aligned name and headings in the brand royal blue. Still single-column, real text. */
export const modernTheme: Theme = {
  base: 10,
  name: 22,
  heading: 11.5,
  lineHeight: 1.38,
  margin: 42,
  sectionGap: 12,
  itemGap: 7,
  accent: "#0A35D6",
  text: "#0B1846",
  muted: "#4A5578",
  rule: "#C9D3F5",
  nameAlign: "left",
  headingStyle: "accent",
};

export function ModernTemplate(props: TemplateProps) {
  return <ResumeDocument {...props} theme={modernTheme} />;
}
