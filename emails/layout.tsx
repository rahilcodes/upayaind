import * as React from "react";
import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://upayaind.com";

export const colors = { royal: "#0A35D6", ink: "#0B1846", muted: "#4A5578", paper: "#FBFAF6", border: "#E6E3D9" };

export function EmailLayout({ preview, children }: { preview: string; children: React.ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.paper, margin: 0, padding: "32px 0", fontFamily: "Inter, Segoe UI, Helvetica, Arial, sans-serif", color: colors.ink }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "#FFFFFF", borderRadius: 16, border: `1px solid ${colors.border}`, overflow: "hidden" }}>
          <Section style={{ backgroundColor: colors.ink, padding: "20px 28px" }}>
            <Text style={{ margin: 0, color: "#FFFFFF", fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 600 }}>UpayaInd</Text>
          </Section>
          <Section style={{ height: 4, backgroundImage: "linear-gradient(90deg,#0A35D6,#0A7CF0,#18B8F2)", backgroundColor: colors.royal }} />
          <Section style={{ padding: "28px" }}>{children}</Section>
          <Hr style={{ borderColor: colors.border, margin: 0 }} />
          <Section style={{ padding: "18px 28px" }}>
            <Text style={{ margin: 0, fontSize: 12, color: colors.muted, lineHeight: "18px" }}>
              You’re receiving this because you have an UpayaInd account. Manage email preferences in{" "}
              <Link href={`${appUrl}/app/settings`} style={{ color: colors.royal }}>settings</Link>. © UpayaInd
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{ display: "inline-block", backgroundColor: colors.royal, color: "#FFFFFF", padding: "13px 24px", borderRadius: 10, fontWeight: 600, fontSize: 15, textDecoration: "none" }}
    >
      {children}
    </Link>
  );
}

export const h1 = { fontSize: 22, fontWeight: 700, margin: "0 0 12px", color: colors.ink } as const;
export const p = { fontSize: 15, lineHeight: "24px", margin: "0 0 16px", color: "#2B3659" } as const;
export const small = { fontSize: 13, lineHeight: "20px", margin: "16px 0 0", color: colors.muted } as const;
