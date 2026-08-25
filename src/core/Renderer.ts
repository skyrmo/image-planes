import vertexShaderSource from "../shaders/vertex.wgsl?raw";
import fragmentShaderSource from "../shaders/fragment.wgsl?raw";
import { WebGPUCore } from "./WebGPUCore";
import type { PlaneRecord } from "../types";

// vec4f rect + f32 opacity + vec2f fitScale, padded to 16-byte struct alignment.
export const UNIFORM_SIZE = 32;
export const UNIFORM_FLOATS = UNIFORM_SIZE / 4;

export class Renderer {
    private core: WebGPUCore;
    private pipeline: GPURenderPipeline | null = null;
    private sampler: GPUSampler | null = null;

    constructor(core: WebGPUCore) {
        this.core = core;
    }

    initialize(): void {
        const device = this.core.getDevice();

        this.sampler = device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
        });

        const vertexShaderModule = device.createShaderModule({
            code: vertexShaderSource,
        });
        const fragmentShaderModule = device.createShaderModule({
            code: fragmentShaderSource,
        });

        this.pipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: vertexShaderModule,
                entryPoint: "vertexMain",
            },
            fragment: {
                module: fragmentShaderModule,
                entryPoint: "fragmentMain",
                targets: [
                    {
                        format: this.core.getCanvasFormat(),
                        blend: {
                            color: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                        },
                    },
                ],
            },
            primitive: {
                topology: "triangle-strip",
            },
        });
    }

    createUniformBuffer(): GPUBuffer {
        const device = this.core.getDevice();
        return device.createBuffer({
            size: UNIFORM_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    createBindGroup(texture: GPUTexture, uniformBuffer: GPUBuffer): GPUBindGroup {
        const device = this.core.getDevice();
        if (!this.pipeline || !this.sampler) {
            throw new Error("Renderer not initialized");
        }

        return device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: texture.createView() },
                { binding: 2, resource: { buffer: uniformBuffer } },
            ],
        });
    }

    renderAll(planes: Iterable<PlaneRecord>): void {
        const device = this.core.getDevice();
        const context = this.core.getContext();

        if (!context || !this.pipeline) {
            console.error("Renderer not properly initialized");
            return;
        }

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 0 }, // transparent — page shows through
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        pass.setPipeline(this.pipeline);

        for (const plane of planes) {
            if (!plane.bindGroup) continue; // texture not ready yet
            if (plane.bounds.width <= 0 || plane.bounds.height <= 0) continue;
            pass.setBindGroup(0, plane.bindGroup);
            pass.draw(4);
        }

        pass.end();
        device.queue.submit([encoder.finish()]);
    }
}
