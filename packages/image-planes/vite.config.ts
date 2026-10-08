import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
    // Writes .d.ts type files next to the build.
    plugins: [dts({ include: ["src"], exclude: ["**/*.test.ts"], entryRoot: "src" })],
    build: {
        lib: { entry: "src/index.ts", formats: ["es"], fileName: "image-planes" },
    },
});
