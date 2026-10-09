import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
    // Writes .d.ts type files next to the build. Test files are left out.
    plugins: [dts({ include: ["src"], exclude: ["**/*.test.ts"], entryRoot: "src" })],
    build: {
        lib: {
            // Two entry points: the core, and the optional effects.
            entry: {
                "image-planes": "src/index.ts",
                effects: "src/effects/index.ts",
            },
            formats: ["es"],
            fileName: (_format, name) => `${name}.js`,
        },
    },
});
