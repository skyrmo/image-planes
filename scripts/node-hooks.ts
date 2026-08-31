import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// `src/` is written for Vite: extensionless imports, and `.wgsl?raw` for
// shaders. Node's resolver does neither. Teaching it both is what lets the
// check scripts import the real modules instead of a copy that drifts.
//
// Registered on evaluation, so import this statically and then reach for the
// modules under test with a dynamic `import()`.

const RAW = "?raw";

registerHooks({
    resolve(specifier, context, next) {
        if (specifier.endsWith(RAW)) {
            const url = new URL(specifier.slice(0, -RAW.length), context.parentURL);
            return { url: `${url.href}${RAW}`, format: "module", shortCircuit: true };
        }

        if (specifier.startsWith(".") && !specifier.endsWith(".ts")) {
            try {
                return next(`${specifier}.ts`, context);
            } catch {
                // Fall through to the unmodified specifier.
            }
        }

        return next(specifier, context);
    },

    load(url, context, next) {
        if (url.endsWith(RAW)) {
            const text = readFileSync(fileURLToPath(url.slice(0, -RAW.length)), "utf8");
            return {
                format: "module",
                source: `export default ${JSON.stringify(text)};`,
                shortCircuit: true,
            };
        }

        return next(url, context);
    },
});
