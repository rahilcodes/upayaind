import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, completeProfileSchema, signupSchema } from "@/lib/schemas/auth";
import { LEGAL_SLUGS } from "@/server/services/cms";

const base = {
  name: "Priya Sharma",
  email: "priya@example.com",
  password: "Correct-Horse-Battery-9",
  phone: "+14155550123",
  market: "US",
  consentTerms: "on",
  consentApply: "on",
  consentAgreement: "on",
};

describe("Placement agreement at sign-up (D-138)", () => {
  it("sign-up requires the agreement checkbox", () => {
    expect(signupSchema.safeParse(base).success).toBe(true);
    const { consentAgreement: _omit, ...without } = base;
    const r = signupSchema.safeParse(without);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path.join("."))).toContain("consentAgreement");
  });

  it("Google profile completion requires it too", () => {
    const r = completeProfileSchema.safeParse({ phone: "+14155550123", market: "US", consentTerms: "on", consentApply: "on" });
    expect(r.success).toBe(false);
    expect(completeProfileSchema.safeParse({ phone: "+14155550123", market: "US", consentTerms: "on", consentApply: "on", consentAgreement: "on" }).success).toBe(true);
  });

  it("the agreement is a fixed legal page and the consent version was bumped", () => {
    expect(LEGAL_SLUGS).toContain("agreement");
    expect(CONSENT_VERSION >= "2026-10-15").toBe(true);
  });
});
