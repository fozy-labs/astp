// Runs the real TS CLI with the project's compiler instead of Node-version-specific type flags.
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const src = new URL("../../src/", import.meta.url);

registerHooks({
    resolve(specifier, context, next) {
        let spec = specifier.startsWith("@/") ? new URL(specifier.slice(2), src).href : specifier;
        if (spec.endsWith(".js") && (spec.startsWith(".") || spec.startsWith("file:"))) {
            const ts = new URL(`${spec.slice(0, -3)}.ts`, context.parentURL);
            if (existsSync(fileURLToPath(ts))) spec = ts.href;
        }
        return next(spec, context);
    },
    load(url, context, next) {
        if (!url.endsWith(".ts")) return next(url, context);
        const source = readFileSync(fileURLToPath(url), "utf8");
        const { outputText } = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        });
        return { format: "module", source: outputText, shortCircuit: true };
    },
});
