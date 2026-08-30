import vertexShaderSource from "../shaders/vertex.wgsl?raw";
import fragmentShaderSource from "../shaders/fragment.wgsl?raw";
import type { PlaneRecord } from "./records";

// vec4f rect + f32 opacity + vec2f fitScale, padded to 16-byte struct alignment.
export const UNIFORM_SIZE = 32;
export const UNIFORM_FLOATS = UNIFORM_SIZE / 4;

// vec2f resolution + vec2f pointer + f32 time + f32 dpr, same padding rule.
// Allocated and bound here but not yet written by anything, so it reads as the
// zeroes WebGPU initialises it to. See docs/shader-effects-plan.md chunk 2.
export const SCENE_UNIFORM_SIZE = 32;
export const SCENE_UNIFORM_FLOATS = SCENE_UNIFORM_SIZE / 4;

// Premultiplied source-over. Has to agree with the canvas alphaMode, the
// texture upload's premultipliedAlpha, and the fragment shader's output.
// Shared by every pipeline so an effect can't disagree with it.
const BLEND: GPUBlendState = {
    color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

export class Renderer {
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private format: GPUTextureFormat;

    private vertexModule: GPUShaderModule;
    private sampler: GPUSampler;

    // Bind groups are split by update frequency: scene once per pass, plane
    // once per draw, effect once per draw. The layouts are explicit rather
    // than derived with layout: "auto" because an auto layout belongs to one
    // pipeline, and its bind groups are not valid on any other one. Sharing
    // these objects is what lets a second pipeline reuse a plane's bind group.
    private sceneLayout: GPUBindGroupLayout;
    private planeLayout: GPUBindGroupLayout;
    private effectLayout: GPUBindGroupLayout;

    // Both name the same scene and plane layout objects, so switching between
    // them mid-pass only invalidates group 2.
    private plainPipelineLayout: GPUPipelineLayout;
    private effectPipelineLayout: GPUPipelineLayout;

    private sceneBuffer: GPUBuffer;
    private sceneBindGroup: GPUBindGroup;

    // Bound to the plane group's second texture slot until something supplies
    // a real one, so that group's layout never varies with what a plane has.
    private fallbackTexture: GPUTexture;

    /** The pipeline every plane without an effect draws with. */
    readonly defaultPipeline: GPURenderPipeline;

    constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat) {
        this.device = device;
        this.context = context;
        this.format = format;

        this.sampler = device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
        });

        this.sceneLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            ],
        });

        this.planeLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                {
                    // The vertex shader reads plane.rect, so this is not
                    // fragment-only. layout: "auto" worked that out on its own;
                    // an explicit layout has to say it, and saying it wrong
                    // fails at pipeline creation rather than silently.
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
            ],
        });

        this.effectLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            ],
        });

        this.plainPipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [this.sceneLayout, this.planeLayout],
        });
        this.effectPipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [this.sceneLayout, this.planeLayout, this.effectLayout],
        });

        this.vertexModule = device.createShaderModule({ code: vertexShaderSource });
        const fragmentModule = device.createShaderModule({ code: fragmentShaderSource });

        this.defaultPipeline = device.createRenderPipeline(
            this.pipelineDescriptor(fragmentModule, false),
        );

        this.sceneBuffer = device.createBuffer({
            size: SCENE_UNIFORM_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.sceneBindGroup = device.createBindGroup({
            layout: this.sceneLayout,
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: { buffer: this.sceneBuffer } },
            ],
        });

        this.fallbackTexture = device.createTexture({
            size: [1, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        // WebGPU zero-initialises resources, but write it anyway so nobody has
        // to go and confirm that this slot is transparent.
        device.queue.writeTexture(
            { texture: this.fallbackTexture },
            new Uint8Array(4),
            { bytesPerRow: 4 },
            [1, 1],
        );
    }

    /**
     * Everything about a pipeline except its fragment module. Kept in one place
     * so a custom effect shader can never disagree with the blend state, the
     * quad topology or the target format.
     */
    private pipelineDescriptor(
        fragmentModule: GPUShaderModule,
        withEffectUniforms: boolean,
    ): GPURenderPipelineDescriptor {
        return {
            layout: withEffectUniforms ? this.effectPipelineLayout : this.plainPipelineLayout,
            vertex: {
                module: this.vertexModule,
                entryPoint: "vertexMain",
            },
            fragment: {
                module: fragmentModule,
                entryPoint: "fragmentMain",
                targets: [{ format: this.format, blend: BLEND }],
            },
            primitive: {
                topology: "triangle-strip",
            },
        };
    }

    createUniformBuffer(): GPUBuffer {
        return this.device.createBuffer({
            size: UNIFORM_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    createPlaneBindGroup(texture: GPUTexture, uniformBuffer: GPUBuffer): GPUBindGroup {
        return this.device.createBindGroup({
            layout: this.planeLayout,
            entries: [
                { binding: 0, resource: texture.createView() },
                { binding: 1, resource: { buffer: uniformBuffer } },
                { binding: 2, resource: this.fallbackTexture.createView() },
            ],
        });
    }

    renderAll(planeRecords: Iterable<PlaneRecord>): void {
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 0 }, // transparent — page shows through
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        pass.setBindGroup(0, this.sceneBindGroup);

        // Tracked so a run of planes sharing a pipeline only sets it once. Do
        // not sort records by pipeline to make those runs longer: there is no
        // depth buffer, so iteration order is stacking order.
        let bound: GPURenderPipeline | null = null;

        for (const record of planeRecords) {
            // pipeline is null until the plane is drawable, planeBindGroup
            // until its texture is ready.
            if (!record.pipeline || !record.planeBindGroup) continue;
            if (record.bounds.width <= 0 || record.bounds.height <= 0) continue;

            if (record.pipeline !== bound) {
                pass.setPipeline(record.pipeline);
                bound = record.pipeline;
            }

            pass.setBindGroup(1, record.planeBindGroup);
            pass.draw(4);
        }

        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    /** Scene-wide GPU resources. Per-plane ones belong to PlaneManager. */
    destroy(): void {
        this.sceneBuffer.destroy();
        this.fallbackTexture.destroy();
    }
}
