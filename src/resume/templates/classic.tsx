import { ResumeDocument, type TemplateProps, type Theme } from "./shared";

/** Classic: centred name, uppercase headings with a hairline rule. Safest choice for every ATS. */
export const classicTheme: Theme = {
  base: 10,
  name: 20,
  heading: 10.5,
  lineHeight: 1.35,
  margin: 40,
  sectionGap: 11,
  itemGap: 7,
  accent: "#0B1846",
  text: "#111827",
  muted: "#4A5578",
  rule: "#9AA3BA",
  nameAlign: "center",
  headingStyle: "rule",
};

export function ClassicTemplate(props: TemplateProps) {
  return <ResumeDocument {...props} theme={classicTheme} />;
}
