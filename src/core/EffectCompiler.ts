import { EFFECT_ENTRY, EFFECT_PRELUDE } from "../shaders/sources";
import { isIdentifier, layoutOf, type UniformLayout } from "./uniforms";
import type { Renderer } from "./Renderer";
import type { EffectDefinition } from "../types";

/**
 * Assembles an effect definition into a complete WGSL program and compiles it.
 *
 * The author writes one function. Everything around it is generated: the
 * uniform declarations, the cover-fit applied on the way in, and the
 * premultiplied alpha applied on the way out. Those last two fail silently
 * when written by hand (a crop that is subtly wrong, dark fringing on
 * transparent images), which is why there is no way to opt out of them.
 */

// Enough to be useful without burying the first one, which is usually the
// only real error.
const MAX_REPORTED = 5;
const CONTEXT_LINES = 3;

export interface CompiledEffect {
    pipeline: GPURenderPipeline;
    /** Null when the effect declares no uniforms, which also means no group 2. */
    layout: UniformLayout | null;
}

export class EffectCompiler {
    private device: GPUDevice;
    private renderer: Renderer;

    // Keyed on the effect object's identity. Constants live on the object, so
    // two constant sets means two objects, which means two keys and no need to
    // serialise anything. Caching the promise rather than the pipeline stops
    // two planes created in the same tick from both compiling.
    private cache: WeakMap<EffectDefinition, Promise<CompiledEffect>> = new WeakMap();

    constructor(device: GPUDevice, renderer: Renderer) {
        this.device = device;
        this.renderer = renderer;
    }

    /** Compile an effect, or hand back the in-flight or finished compile. */
    compile(effect: EffectDefinition): Promise<CompiledEffect> {
        let pending = this.cache.get(effect);

        if (!pending) {
            pending = this.build(effect).catch((error: unknown) => {
                // Drop the entry so a fixed definition can be retried, rather
                // than every future plane getting the original rejection.
                this.cache.delete(effect);
                throw error;
            });
            this.cache.set(effect, pending);
        }

        return pending;
    }

    private async build(effect: EffectDefinition): Promise<CompiledEffect> {
        const values = effect.uniforms ?? {};
        const layout = Object.keys(values).length > 0 ? layoutOf(values) : null;
        const code = assembleEffectSource(effect, layout);

        const module = this.device.createShaderModule({ code });

        const info = await module.getCompilationInfo();
        const errors = info.messages.filter((message) => message.type === "error");
        if (errors.length > 0) {
            throw new Error(formatShaderError(code, errors));
        }

        const pipeline = await this.renderer.buildPipelineAsync(module, layout !== null);
        return { pipeline, layout };
    }
}

/**
 * The full WGSL program for an effect. Exported because it is the only way to
 * see what a shader error's line numbers actually refer to.
 */
export function assembleEffectSource(
    effect: EffectDefinition,
    layout: UniformLayout | null,
): string {
    const constants = Object.entries(effect.constants ?? {}).map(([name, value]) => {
        if (!isIdentifier(name)) {
            throw new Error(
                `[image-planes] effect constant "${name}" is not a valid WGSL identifier`,
            );
        }
        if (typeof value !== "number" || !Number.isFinite(value)) {
            throw new Error(`[image-planes] effect constant "${name}" must be a finite number`);
        }
        // An integer emits bare, so WGSL reads it as AbstractInt and it works
        // as both a loop bound and an f32 operand.
        return `const ${name} = ${value};`;
    });

    return [EFFECT_PRELUDE, constants.join("\n"), layout?.wgsl ?? "", effect.fragment, EFFECT_ENTRY]
        .filter((part) => part.trim().length > 0)
        .join("\n\n");
}

/**
 * Print the failing lines of the *generated* source. The line numbers a driver
 * reports index into that, where the author's line 3 might be line 70, so
 * echoing their snippet back points at the wrong line or at none at all.
 */
export function formatShaderError(code: string, messages: GPUCompilationMessage[]): string {
    const lines = code.split("\n");

    const blocks = messages.slice(0, MAX_REPORTED).map((message) => {
        const lineNum = Number(message.lineNum);
        // lineNum is 0 when the driver has no position for the error.
        if (lineNum < 1 || lineNum > lines.length) return message.message;

        const from = Math.max(1, lineNum - CONTEXT_LINES);
        const to = Math.min(lines.length, lineNum + CONTEXT_LINES);
        const gutter = String(to).length;
        const linePos = Number(message.linePos);

        const excerpt: string[] = [];
        for (let n = from; n <= to; n++) {
            excerpt.push(`${n === lineNum ? ">" : " "} ${String(n).padStart(gutter)} | ${lines[n - 1]}`);
            if (n === lineNum && linePos > 0) {
                excerpt.push(`${" ".repeat(gutter + 3)}| ${" ".repeat(linePos - 1)}^`);
            }
        }

        return `${message.message}\n\n${excerpt.join("\n")}`;
    });

    return (
        "[image-planes] effect shader failed to compile.\n" +
        "Line numbers are into the generated shader, which begins with the prelude.\n\n" +
        blocks.join("\n\n")
    );
}
