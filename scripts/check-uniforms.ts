import { strict as assert } from "node:assert";
import { cloneValues, layoutOf, pack } from "../src/core/uniforms.ts";

const at = (l: ReturnType<typeof layoutOf>, n: string) =>
    l.fields.find((f) => f.name === n)!.index * 4;

// offset table
const c1 = layoutOf({ a: 1 });
assert.equal(at(c1, "a"), 0); assert.equal(c1.byteSize, 16); assert.equal(c1.floats, 4);

const c2 = layoutOf({ a: 1, b: [0, 0] });
assert.equal(at(c2, "a"), 0); assert.equal(at(c2, "b"), 8); assert.equal(c2.byteSize, 16);

const c3 = layoutOf({ a: [0, 0, 0], b: 1 });
assert.equal(at(c3, "a"), 0); assert.equal(at(c3, "b"), 12); assert.equal(c3.byteSize, 16);

// the vec3f align-16 case
const c4 = layoutOf({ a: 1, b: [0, 0, 0] });
assert.equal(at(c4, "a"), 0); assert.equal(at(c4, "b"), 16); assert.equal(c4.byteSize, 32);

const c5 = layoutOf({ a: [0, 0, 0, 0], b: [0, 0, 0] });
assert.equal(at(c5, "a"), 0); assert.equal(at(c5, "b"), 16); assert.equal(c5.byteSize, 32);

// declaration order preserved
assert.deepEqual(layoutOf({ z: 1, a: 2 }).fields.map((f) => f.name), ["z", "a"]);

// pack
const l = layoutOf({ strength: 1, tint: [0, 0, 0], progress: 0 });
const out = new Float32Array(l.floats);
pack(l, { strength: 2.5, tint: [1, 2, 3], progress: 0.5 }, out);
assert.deepEqual([...out], [2.5, 0, 0, 0, 1, 2, 3, 0.5]);

// pack tolerates a missing key without crashing or leaking the old value
pack(l, { strength: 9 }, out);
assert.deepEqual([...out], [9, 0, 0, 0, 0, 0, 0, 0]);

// generated wgsl
assert.equal(
    layoutOf({ strength: 1, tint: [0, 0, 0] }).wgsl,
    `struct EffectUniforms {
    strength: f32,
    tint: vec3f,
};

@group(2) @binding(0) var<uniform> u: EffectUniforms;`,
);

// rejections
for (const bad of [{}, { a: [1] }, { a: [1, 2, 3, 4, 5] }, { a: "x" }, { "a b": 1 }, { __a: 1 }]) {
    assert.throws(() => layoutOf(bad as never), /image-planes/, `should reject ${JSON.stringify(bad)}`);
}

// cloneValues: the bug most likely to ship, because a single-plane demo never
// shows it. Two planes sharing one imported effect must not share values.
{
    const definition = { strength: 1, tint: [1, 0, 0] };
    const a = cloneValues(definition);
    const b = cloneValues(definition);

    a.strength = 9;
    (a.tint as number[])[0] = 9;

    assert.equal(b.strength, 1, "scalars are independent");
    assert.deepEqual(b.tint, [1, 0, 0], "arrays are copied, not aliased");
    assert.deepEqual(definition.tint, [1, 0, 0], "the definition itself is untouched");
    assert.notEqual(a.tint, definition.tint);
}

console.log("all uniforms.ts assertions passed");
