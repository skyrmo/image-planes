import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
    resolve: {
        // Use the library's source, not its build, so edits reload instantly.
        // Keep in sync with `paths` in tsconfig.json.
        alias: {
            "image-planes": fileURLToPath(
                new URL("../packages/image-planes/src/index.ts", import.meta.url),
            ),
        },
    },
});
