import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { varsIgnorePattern: "^_", argsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-source directories (tooling scripts, generated reports, data, python).
    ".claude/**",
    ".impeccable/**",
    "playwright-report/**",
    "test-results/**",
    "backups/**",
    "design-system/**",
    "science/**",
    "drizzle/**",
    "data/**",
    "public/**",
  ]),
]);

export default eslintConfig;
