import { ResumeDocument, type TemplateProps, type Theme } from "./shared";

/** Compact: smaller type and tighter spacing to fit long histories on fewer pages. */
export const compactTheme: Theme = {
  base: 9,
  name: 17,
  heading: 9.5,
  lineHeight: 1.28,
  margin: 30,
  sectionGap: 8,
  itemGap: 5,
  accent: "#0B1846",
  text: "#111827",
  muted: "#4A5578",
  rule: "#B5BCCD",
  nameAlign: "left",
  headingStyle: "caps",
};

export function CompactTemplate(props: TemplateProps) {
  return <ResumeDocument {...props} theme={compactTheme} />;
}
