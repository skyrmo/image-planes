import type { UniformValue, UniformValues } from "../types";

/**
 * Turns the plain JS values an effect declares into a WGSL struct, the byte
 * offsets to write those values at, and a pack function. No GPU types and no
 * imports from the rest of `core/`, so this is the one piece of the effect
 * machinery that can be checked with plain assertions.
 *
 * The point of generating the struct text and the offsets from the same walk
 * is that they cannot drift apart. Hand-syncing a struct against a size
 * constant is what PLANE_UNIFORM_SIZE and the two .wgsl files still do, and it
 * survives only because nobody touches it.
 */

type Kind = "f32" | "vec2f" | "vec3f" | "vec4f";

// WGSL uniform address space rules. vec3f is the one that catches people out:
// it occupies 12 bytes but aligns to 16.
const ALIGN: Record<Kind, number> = { f32: 4, vec2f: 8, vec3f: 16, vec4f: 16 };
const SIZE: Record<Kind, number> = { f32: 4, vec2f: 8, vec3f: 12, vec4f: 16 };

// A struct in the uniform address space rounds its size up to a multiple of 16.
const STRUCT_ALIGN = 16;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface Field {
    name: string;
    kind: Kind;
    /** Index into the packed Float32Array, i.e. byte offset / 4. */
    index: number;
    /** How many floats this field occupies. */
    count: number;
}

export interface UniformLayout {
    fields: Field[];
    /** Always a multiple of 16. The size to allocate the uniform buffer at. */
    byteSize: number;
    floats: number;
    /** The generated struct plus its group 2 binding, ready to concatenate. */
    wgsl: string;
}

function align(offset: number, to: number): number {
    return Math.ceil(offset / to) * to;
}

/**
 * Whether a name can be used as a WGSL identifier. Checked for uniform and
 * constant names alike: without it, a bad name fails deep inside a shader
 * compile with a message pointing at generated source.
 */
export function isIdentifier(name: string): boolean {
    return IDENTIFIER.test(name) && !name.startsWith("__");
}

function kindOf(name: string, value: UniformValue): Kind {
    if (typeof value === "number") return "f32";
    if (Array.isArray(value)) {
        if (value.length === 2) return "vec2f";
        if (value.length === 3) return "vec3f";
        if (value.length === 4) return "vec4f";
    }
    throw new Error(
        `[image-planes] uniform "${name}" must be a number, ` +
            "or an array of 2, 3 or 4 numbers",
    );
}

/**
 * Derive offsets, buffer size and struct text from an effect's initial values.
 *
 * Fields keep declaration order rather than being sorted by alignment: the
 * generated struct should read the way the author wrote it, and the padding a
 * sort would save is a few bytes in a buffer this small.
 *
 * Callers are expected to skip effects that declare no uniforms; an empty
 * struct is not valid WGSL, so it throws rather than generating one.
 */
export function layoutOf(values: UniformValues): UniformLayout {
    const names = Object.keys(values);
    if (names.length === 0) {
        throw new Error("[image-planes] layoutOf() needs at least one uniform");
    }

    const fields: Field[] = [];
    let offset = 0;

    for (const name of names) {
        if (!isIdentifier(name)) {
            throw new Error(
                `[image-planes] uniform name "${name}" is not a valid WGSL identifier`,
            );
        }

        const kind = kindOf(name, values[name]);
        offset = align(offset, ALIGN[kind]);
        fields.push({ name, kind, index: offset / 4, count: SIZE[kind] / 4 });
        offset += SIZE[kind];
    }

    const byteSize = align(offset, STRUCT_ALIGN);
    const body = fields.map((field) => `    ${field.name}: ${field.kind},`).join("\n");

    return {
        fields,
        byteSize,
        floats: byteSize / 4,
        wgsl:
            `struct EffectUniforms {\n${body}\n};\n\n` +
            "@group(2) @binding(0) var<uniform> u: EffectUniforms;",
    };
}

/**
 * A plane's own copy of an effect's initial values. Effects are shared by
 * reference, so without this two planes using one imported effect would share
 * a single live object and tweening either would move both.
 */
export function cloneValues(values: UniformValues): UniformValues {
    const out: UniformValues = {};
    for (const key of Object.keys(values)) {
        const value = values[key];
        out[key] = Array.isArray(value) ? [...value] : value;
    }
    return out;
}

/**
 * Write the current values into `out`, which is reused across frames. Read
 * fresh every time, so mutating the live `plane.uniforms` object is all a
 * consumer has to do.
 */
export function pack(layout: UniformLayout, values: UniformValues, out: Float32Array): void {
    for (const field of layout.fields) {
        const value = values[field.name];

        if (typeof value === "number") {
            out[field.index] = value;
            continue;
        }

        // A deleted key or a changed shape zero-fills rather than leaving
        // whatever the previous plane wrote, since `out` is shared.
        for (let i = 0; i < field.count; i++) {
            out[field.index + i] = Array.isArray(value) ? (value[i] ?? 0) : 0;
        }
    }
}
