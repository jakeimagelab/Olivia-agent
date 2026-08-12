import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  {
    ignores: [
      ".next/**", "node_modules/**", "output/**", "tmp/**", ".playwright-cli/**",
      ".agents/**", ".claude/**", ".superpowers/**", "public/**", "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-this-alias": "off",
      "react/no-unescaped-entities": "off",
      // Legacy pages predate the flat config. Keep their existing behavior while
      // new/changed modules are covered by TypeScript and targeted tests.
      "react-hooks/rules-of-hooks": "off",
      "@next/next/no-html-link-for-pages": "off",
      "prefer-const": "warn",
    },
  },
  {
    files: [
      "app/(photo-studio)/photo-sorting/page.tsx",
      "app/api/photo-scene-boundary-analyze/**/*.ts",
      "lib/photo-classifier/**/*.ts",
      "tests/photoClassificationHybrid.test.ts",
    ],
    rules: {
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
