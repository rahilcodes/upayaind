import { describe, expect, it } from "vitest";
import { open, seal, sha256 } from "@/server/crypto";

describe("envelope encryption (SPEC §10)", () => {
  it("round-trips and never stores plaintext", () => {
    const secret = "hunter2-correct-horse";
    const c = seal(secret);
    expect(c.startsWith("v1.")).toBe(true);
    expect(c).not.toContain(secret);
    expect(open(c)).toBe(secret);
  });
  it("uses a fresh data key and IV each time", () => {
    expect(seal("same")).not.toBe(seal("same"));
  });
  it("detects tampering", () => {
    const c = seal("value");
    const parts = c.split(".");
    const data = Buffer.from(parts[4]!, "base64url");
    data[0] = data[0]! ^ 1;
    parts[4] = data.toString("base64url");
    expect(() => open(parts.join("."))).toThrow();
  });
  it("hashes tokens deterministically", () => {
    expect(sha256("abc")).toHaveLength(64);
    expect(sha256("abc")).toBe(sha256("abc"));
  });
});
