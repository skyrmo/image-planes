import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";

export default defineConfig({
    // rollupTypes is off: api-extractor's bundled compiler (TS 5.9) chokes on TS 6
    // output and emits an empty d.ts. Shipping the per-file declaration tree instead.
    plugins: [dts({ include: ["src"], entryRoot: "src" })],
    build: {
        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            formats: ["es"],
            fileName: "image-planes",
        },
    },
});
