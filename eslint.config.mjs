import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Generado por Next
    ".next/**", "out/**", "build/**", "next-env.d.ts",
    // Web estática actual (se borra en el corte, fase 9) y prototipos
    "assets/**", "api/**", "raids/**", "jugadores/**", "prototipos/**",
  ]),
]);

export default eslintConfig;
