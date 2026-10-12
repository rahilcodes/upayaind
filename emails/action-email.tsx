import * as React from "react";
import { Section, Text } from "@react-email/components";
import { EmailButton, EmailLayout, h1, p, small } from "./layout";

/**
 * One flexible transactional template used for every F13 event:
 * a heading, 1–3 paragraphs, an optional button and an optional footnote.
 * Subjects and copy live in src/server/services/email-templates.ts.
 */
export type ActionEmailProps = {
  preview: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; href: string };
  footnote?: string;
  rows?: { label: string; value: string }[];
};

export default function ActionEmail({ preview, heading, paragraphs, cta, footnote, rows }: ActionEmailProps) {
  return (
    <EmailLayout preview={preview}>
      <Text style={h1}>{heading}</Text>
      {paragraphs.map((t, i) => (
        <Text key={i} style={p}>
          {t}
        </Text>
      ))}
      {rows?.length ? (
        <Section style={{ border: "1px solid #E3E6EF", borderRadius: 12, padding: "6px 16px", margin: "4px 0 20px" }}>
          {rows.map((r, i) => (
            <Text key={i} style={{ fontSize: 14, margin: "10px 0", color: "#2B3659" }}>
              <span style={{ color: "#5A6585" }}>{r.label}: </span>
              <strong>{r.value}</strong>
            </Text>
          ))}
        </Section>
      ) : null}
      {cta ? (
        <Section style={{ margin: "8px 0 4px" }}>
          <EmailButton href={cta.href}>{cta.label}</EmailButton>
        </Section>
      ) : null}
      {footnote ? <Text style={small}>{footnote}</Text> : null}
    </EmailLayout>
  );
}

ActionEmail.PreviewProps = {
  preview: "Verify your email",
  heading: "Confirm your email",
  paragraphs: ["Click the button below to verify your email address. The link is valid for 24 hours."],
  cta: { label: "Verify email", href: "https://upayaind.com/verify-email?token=example" },
  footnote: "If you didn't create an account, you can ignore this email.",
} satisfies ActionEmailProps;
