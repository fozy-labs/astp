import config from "@fozy-labs/js-configs/eslint";

export default [
    {
        ignores: ["eslint.config.js", "vitest.config.ts", "tests/"],
    },
    ...config,
];
