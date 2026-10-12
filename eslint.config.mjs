import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@/generated/prisma/client", message: "Use @/server/db on the server, or @/generated/prisma/enums in client code." }],
        },
      ],
    },
  },
  {
    files: ["src/server/db.ts", "prisma/**", "src/server/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**", "coverage/**", "playwright-report/**", "scripts/**"],
  },
];

export default eslintConfig;
