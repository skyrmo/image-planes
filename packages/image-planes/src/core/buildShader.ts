import type { Brick, BrickKind } from "../types";
import { listSettings } from "./settings";
import { BINDINGS, COMMON, FRAGMENT, HELPERS, VERTEX } from "../shaders/sources";

export function buildShader(bricks: Brick[]): string {
    /** Check that a brick is only in the list once.  */
    const names = new Set<string>();
    for (const brick of bricks) {
        if (names.has(brick.name)) {
            throw new Error(`[image-planes] effect "${brick.name}" is in the list twice`);
        }
        names.add(brick.name);
    }

    const fields = listSettings(bricks)
        .map((slot) => `    ${slot.field}: f32,`)
        .join("\n");
    const common = COMMON.replace("    // @settings", fields);

    // Rename each brick's special words. `prev` is chained through the read bricks.
    const functions: string[] = [];
    let lastRead = "readImage"; // the first read brick reads the image itself
    for (const brick of bricks) {
        let code = brick.wgsl
            .replace(/\bmain\b/g, `${brick.name}_main`)
            .replace(/\bmy\.(\w+)/g, `plane.${brick.name}_$1`);

        if (brick.kind === "read") {
            code = code.replace(/\bprev\b/g, lastRead);
            lastRead = `${brick.name}_main`;
        }

        functions.push(code);
    }

    // 4. The four apply functions that vertex.wgsl and fragment.wgsl call.
    const calls = (kind: BrickKind, variable: string) =>
        bricks
            .filter((brick) => brick.kind === kind)
            .map((brick) => `    ${variable} = ${brick.name}_main(${variable});`)
            .join("\n");

    const apply = `
fn applyShape(rect: vec4f) -> vec4f {
    var r = rect;
${calls("shape", "r")}
    return r;
}

fn applyUv(uv: vec2f) -> vec2f {
    var u = uv;
${calls("uv", "u")}
    return u;
}

fn applyRead(uv: vec2f) -> vec4f {
    return ${lastRead}(uv);
}

fn applyColor(color: vec4f) -> vec4f {
    var c = color;
${calls("color", "c")}
    return c;
}`;

    // 5. Glue it all together.
    return [common, BINDINGS, HELPERS, ...functions, apply, VERTEX, FRAGMENT].join("\n\n");
}
