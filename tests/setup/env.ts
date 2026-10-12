import "dotenv/config";

// Unit tests run against a dedicated database (created by CI / `tests/README`).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL?.replace(/\/upayaind(\?|$)/, "/upayaind_test$1");
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-test-secret";
process.env.VAULT_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64");
(process.env as Record<string, string>).NODE_ENV = "test";
