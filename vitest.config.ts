import path from "node:path";

import baseConfig from "@fozy-labs/js-configs/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
        },
    },
    test: {
        ...baseConfig.test,
        environment: "node",
        setupFiles: [],
        include: ["src/**/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    },
});
