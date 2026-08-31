import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "./node-hooks.ts";

// Loaded dynamically so the hooks above are registered first.
const { assembleEffectSource, formatShaderError } = await import(
    "../src/core/EffectCompiler.ts"
);
const { layoutOf } = await import("../src/core/uniforms.ts");

// Whether the generated WGSL actually compiles cannot be answered in Node, so
// this script does two things: assert everything about the assembled text that
// is checkable here, then emit a self-contained page that hands the same text
// to a real device.

const cases = [
    {
        name: "no uniforms",
        effect: {
            fragment: `fn effectMain(fx: EffectIn) -> vec4f {
    return sample(fx.uv);
}`,
        },
    },
    {
        name: "uniforms, including the vec3f alignment case",
        effect: {
            uniforms: { strength: 1, tint: [1, 0, 0], progress: 0 },
            fragment: `fn effectMain(fx: EffectIn) -> vec4f {
    let c = sample(fx.uv);
    return vec4f(mix(c.rgb, u.tint, u.strength * u.progress), c.a);
}`,
        },
    },
    {
        name: "constants, velocity, scene and planeUv",
        effect: {
            constants: { SAMPLES: 12 },
            uniforms: { strength: 1 },
            fragment: `fn effectMain(fx: EffectIn) -> vec4f {
    let dir = toUv(plane.velocity) * u.strength;
    var acc = vec4f(0.0);
    for (var i = 0; i < SAMPLES; i++) {
        acc += sample(fx.uv + dir * (f32(i) / f32(SAMPLES - 1) - 0.5));
    }
    let fade = 1.0 - fx.planeUv.y * 0.0 + scene.time * 0.0;
    return acc / f32(SAMPLES) * fade * plane.aspect / plane.aspect;
}`,
        },
    },
    {
        name: "deliberate typo, must fail",
        expectError: true,
        effect: {
            fragment: `fn effectMain(fx: EffectIn) -> vec4f {
    return sampl(fx.uv);
}`,
        },
    },
];

const assembled = cases.map(({ name, effect, expectError }) => {
    const values = effect.uniforms ?? {};
    const layout = Object.keys(values).length > 0 ? layoutOf(values) : null;
    return { name, expectError: expectError === true, code: assembleEffectSource(effect, layout) };
});

// Structure of the generated program.
for (const { name, code } of assembled) {
    assert.ok(code.trimEnd().endsWith("}"), `${name}: entry point comes last`);
    assert.ok(
        code.indexOf("struct PlaneUniforms") < code.indexOf("fn effectMain"),
        `${name}: the prelude comes before the author's function`,
    );
    assert.ok(
        code.indexOf("fn effectMain") < code.indexOf("fn fragmentMain"),
        `${name}: effectMain must be declared before the entry point uses it`,
    );
    // One copy of each shared struct, assembled from common.wgsl rather than
    // pasted per module.
    assert.equal(
        code.split("struct PlaneUniforms").length - 1,
        1,
        `${name}: PlaneUniforms appears exactly once`,
    );
    assert.ok(code.includes("fn toUv"), `${name}: prelude helpers present`);
}

assert.ok(!assembled[0].code.includes("EffectUniforms"), "no uniforms means no group 2 struct");
assert.ok(assembled[1].code.includes("@group(2) @binding(0)"), "uniforms bind at group 2");
assert.ok(assembled[1].code.includes("    tint: vec3f,"), "vec3f field emitted");
assert.ok(assembled[2].code.includes("const SAMPLES = 12;"), "integer constant emits bare");

// Constant rejections.
for (const constants of [{ SAMPLES: NaN }, { SAMPLES: Infinity }, { "not an id": 1 }]) {
    assert.throws(
        () => assembleEffectSource({ fragment: "", constants } as never, null),
        /image-planes/,
        `should reject ${JSON.stringify(constants)}`,
    );
}

// Caret alignment in the error formatter. Fiddly, and wrong by one is the
// kind of thing nobody notices until they are already confused.
{
    const code = "line one\nlet x = ;\nline three";
    const report = formatShaderError(code, [
        { type: "error", message: "expected expression", lineNum: 2, linePos: 9 } as never,
    ]);
    const lines = report.split("\n");
    const source = lines.find((l) => l.startsWith("> "))!;
    const caret = lines[lines.indexOf(source) + 1];

    assert.equal(source.indexOf("let x = ;"), 6);
    assert.equal(caret.indexOf("^"), 6 + 8, "caret sits under linePos 9 of the source line");
    assert.ok(report.includes("expected expression"));
    assert.ok(report.includes("begins with the prelude"));
}

// A message with no position falls back to the bare text rather than throwing.
assert.equal(
    formatShaderError("a\nb", [{ type: "error", message: "no position", lineNum: 0 } as never])
        .split("\n\n")[1],
    "no position",
);

console.log("all EffectCompiler assembly assertions passed");

// The half Node cannot answer: hand each program to a real device.
const page = `<!doctype html>
<meta charset="utf-8">
<title>image-planes effect shader check</title>
<style>
    body { font: 13px/1.5 ui-monospace, monospace; margin: 2rem; max-width: 100ch; }
    h2 { font-size: 13px; margin: 2rem 0 .5rem; }
    pre { background: #f4f4f4; padding: .75rem; overflow-x: auto; white-space: pre-wrap; }
    .ok { color: #0a7; } .bad { color: #d00; }
</style>
<body>
<h1>effect shader check</h1>
<div id="out">running…</div>
<script type="module">
const cases = ${JSON.stringify(assembled, null, 4)};
const out = document.getElementById("out");
const say = (cls, text) => {
    const el = document.createElement("pre");
    el.className = cls;
    el.textContent = text;
    out.append(el);
};

out.textContent = "";

if (!navigator.gpu) {
    say("bad", "No navigator.gpu. Chrome or Edge, and serve over http if file:// is blocked.");
} else {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    let failures = 0;

    for (const c of cases) {
        const h = document.createElement("h2");
        h.textContent = c.name;
        out.append(h);

        const module = device.createShaderModule({ code: c.code });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter((m) => m.type === "error");
        const warnings = info.messages.filter((m) => m.type === "warning");

        if (c.expectError) {
            if (errors.length > 0) {
                say("ok", "failed to compile, as expected:\\n" +
                    errors.map((m) => \`  line \${m.lineNum}:\${m.linePos}  \${m.message}\`).join("\\n"));
            } else {
                failures++;
                say("bad", "expected this to fail and it compiled");
            }
        } else if (errors.length > 0) {
            failures++;
            say("bad", errors.map((m) => \`line \${m.lineNum}:\${m.linePos}  \${m.message}\`).join("\\n"));
            say("bad", c.code.split("\\n").map((l, i) => String(i + 1).padStart(4) + " | " + l).join("\\n"));
        } else {
            say("ok", "compiles" + (warnings.length ? " (with warnings)" : ""));
        }

        if (warnings.length > 0) {
            say("", warnings.map((m) => \`warning line \${m.lineNum}: \${m.message}\`).join("\\n"));
        }
    }

    const verdict = document.createElement("h2");
    verdict.className = failures === 0 ? "ok" : "bad";
    verdict.textContent = failures === 0
        ? "ALL PASS — the prelude compiles and no identifier in it is reserved"
        : failures + " FAILURE(S)";
    out.prepend(verdict);
}
</script>
`;

const target = fileURLToPath(new URL("./effect-shader-check.html", import.meta.url));
writeFileSync(target, page);
console.log(`wrote ${target}\nopen it in Chrome to compile these against a real device`);
