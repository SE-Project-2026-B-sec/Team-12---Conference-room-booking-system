import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "performance/session-check.js",
      "performance/post-session-check.js",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
        URL: "readonly",
        console: "readonly",
      },
    },
  },

  {
    files: ["performance/booking-load-test.js"],
    languageOptions: {
      globals: {
        open: "readonly",
        __ENV: "readonly",
        __VU: "readonly",
        __ITER: "readonly",
      },
    },
  }
);
