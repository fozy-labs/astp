// Lets `node --experimental-transform-types` run src/cli.ts: maps `@/` to src/ and `.js` imports to `.ts` files.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

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
});
