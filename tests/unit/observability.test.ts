import { describe, expect, it } from "vitest";
import { isSensitiveKey, scrubEvent, scrubString, scrubUser, scrubValue } from "@/lib/sentry-scrub";
import { _internal } from "@/server/log";
import { withRequestId, currentRequestId, newRequestId } from "@/server/request";

describe("sentry scrubber (D-130)", () => {
  it("flags *Enc, password, token and key-like fields", () => {
    for (const k of ["passwordHash", "totpSecretEnc", "usernameEnc", "token", "accessToken", "apiKey", "api_key", "authorization", "cookie", "STRIPE_SECRET_KEY"]) {
      expect(isSensitiveKey(k), k).toBe(true);
    }
    // `email` is handled by scrubUser (never sent as user context), not by key matching.
    for (const k of ["id", "role", "studentId", "name", "status", "amountMinor", "email"]) {
      expect(isSensitiveKey(k), k).toBe(false);
    }
  });

  it("redacts nested values and arrays, keeps the rest", () => {
    const out = scrubValue({ a: 1, passwordHash: "x", nested: { totpSecretEnc: "y", ok: "z", list: [{ token: "t", keep: true }] } });
    expect(out).toEqual({ a: 1, passwordHash: "[Filtered]", nested: { totpSecretEnc: "[Filtered]", ok: "z", list: [{ token: "[Filtered]", keep: true }] } });
  });

  it("reduces user context to id + role", () => {
    expect(scrubUser({ id: "u1", role: "STUDENT", email: "a@b.c", ip_address: "1.2.3.4", username: "x" })).toEqual({ id: "u1", role: "STUDENT" });
    expect(scrubUser(undefined)).toBeUndefined();
  });

  it("scrubs query strings and JSON bodies", () => {
    expect(scrubString("?next=/app&token=abc123&page=2")).toBe("?next=/app&token=[Filtered]&page=2");
    expect(JSON.parse(scrubString(JSON.stringify({ email: "a@b.c", password: "hunter2" })))).toEqual({ email: "a@b.c", password: "[Filtered]" });
  });

  it("scrubs a whole event in place (beforeSend)", () => {
    const event = {
      type: undefined,
      user: { id: 7, email: "me@x.y", role: "ADMIN" },
      extra: { payload: { passwordHash: "h", amount: 100 } },
      contexts: { state: { totpSecretEnc: "s" } },
      tags: { role: "ADMIN" },
      request: { cookies: { session: "abc" }, headers: { authorization: "Bearer x", accept: "*/*" }, data: "password=p&x=1", query_string: "token=1" },
      breadcrumbs: [{ data: { apiKey: "k", url: "/x" } }],
    };
    const out = scrubEvent(event);
    expect(out).toBe(event);
    expect(out.user).toEqual({ id: "7", role: "ADMIN" });
    expect(out.extra).toEqual({ payload: { passwordHash: "[Filtered]", amount: 100 } });
    expect(out.contexts).toEqual({ state: { totpSecretEnc: "[Filtered]" } });
    expect(out.request.cookies).toBe("[Filtered]");
    expect(out.request.headers).toEqual({ authorization: "[Filtered]", accept: "*/*" });
    expect(out.request.data).toBe("password=[Filtered]&x=1");
    expect(out.request.query_string).toBe("token=[Filtered]");
    expect(out.breadcrumbs[0]!.data).toEqual({ apiKey: "[Filtered]", url: "/x" });
  });
});

describe("structured log (D-131)", () => {
  it("normalises errors and redacts secret fields", () => {
    const err = new Error("boom", { cause: new Error("root") });
    const out = _internal.normalise({ err, token: "t", userId: "u1", skip: undefined }) as { err: { name: string; message: string; cause?: { message: string } }; token: string; userId: string };
    expect(out.err.name).toBe("Error");
    expect(out.err.message).toBe("boom");
    expect(out.err.cause?.message).toBe("root");
    expect(out.token).toBe("[Filtered]");
    expect(out.userId).toBe("u1");
    expect("skip" in out).toBe(false);
  });

  it("carries a request id through withRequestId", () => {
    expect(currentRequestId()).toBeUndefined();
    const id = newRequestId();
    expect(id).toMatch(/^req_[a-f0-9]{20}$/);
    withRequestId(id, () => expect(currentRequestId()).toBe(id));
    expect(currentRequestId()).toBeUndefined();
  });
});
