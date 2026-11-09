import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Generado por Next
    ".next/**", "out/**", "build/**", "next-env.d.ts",
    // Prototipos de la fase 1
    "prototipos/**",
  ]),
]);

export default eslintConfig;
