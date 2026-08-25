import tsParser from "@typescript-eslint/parser";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  { ignores: [".next/**", "node_modules/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { "@next/next": nextPlugin },
    rules: { "no-unused-vars": "off", ...nextPlugin.configs["core-web-vitals"].rules },
  },
];
