import { describe, expect, test } from "vitest";
import type { Brick } from "../types";
import { buildShader } from "./buildShader";
import { listSettings, planeFloats } from "./settings";

const tint: Brick = {
    name: "tint",
    kind: "color",
    settings: { amount: 0.5 },
    wgsl: "fn main(color: vec4f) -> vec4f { return color * my.amount; }",
};

const first: Brick = {
    name: "first",
    kind: "read",
    settings: {},
    wgsl: "fn main(uv: vec2f) -> vec4f { return prev(uv); }",
};

const second: Brick = { ...first, name: "second" };

describe("buildShader", () => {
    test("with no bricks, the image is read directly", () => {
        const code = buildShader([]);
        expect(code).toContain("return readImage(uv);");
        expect(code).not.toContain("// @settings");
    });

    test("renames main and my.", () => {
        const code = buildShader([tint]);
        expect(code).toContain("fn tint_main(color: vec4f)");
        expect(code).toContain("color * plane.tint_amount");
        expect(code).toContain("tint_amount: f32,");
        expect(code).toContain("c = tint_main(c);");
    });

    test("chains read bricks through prev", () => {
        const code = buildShader([first, second]);
        expect(code).toContain("fn first_main(uv: vec2f) -> vec4f { return readImage(uv); }");
        expect(code).toContain("fn second_main(uv: vec2f) -> vec4f { return first_main(uv); }");
        expect(code).toContain("return second_main(uv);");
    });

    test("refuses the same brick twice", () => {
        expect(() => buildShader([tint, tint])).toThrow('"tint" is in the list twice');
    });
});

describe("settings", () => {
    test("lists settings in brick order", () => {
        const slots = listSettings([tint, { ...tint, name: "other", settings: { a: 1, b: 2 } }]);
        expect(slots.map((slot) => slot.field)).toEqual(["tint_amount", "other_a", "other_b"]);
    });

    test("buffer size rounds up to whole 16-byte blocks", () => {
        expect(planeFloats(0)).toBe(12); // 10 → 12
        expect(planeFloats(2)).toBe(12); // 12 → 12
        expect(planeFloats(3)).toBe(16); // 13 → 16
    });
});
