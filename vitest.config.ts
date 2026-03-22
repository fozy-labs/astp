import path from "node:path";

import baseConfig from "@fozy-labs/js-configs/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default defineConfig(
    mergeConfig(
        baseConfig,
        {
            resolve: {
                alias: {
                    "@": path.resolve(import.meta.dirname, "src"),
                },
            },
            test: {
                environment: "node",
                setupFiles: [],
                include: ["src/**/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
                coverage: baseConfig.test?.coverage
                    ? {
                        ...baseConfig.test.coverage,
                        exclude: baseConfig.test.coverage.exclude
                            ? [...baseConfig.test.coverage.exclude]
                            : undefined,
                    }
                    : undefined,
            },
        }
    )
);
