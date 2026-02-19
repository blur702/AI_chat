/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  {
    files: ["frontend/**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "no-unused-vars": "off",
    },
  },
];
