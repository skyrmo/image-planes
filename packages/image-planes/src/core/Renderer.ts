import type { PlaneRecord } from "./records";

const BLEND: GPUBlendState = {
    color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

export class Renderer {
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private format: GPUTextureFormat;

    private sceneLayout: GPUBindGroupLayout;
    private planeLayout: GPUBindGroupLayout;
    private pipelineLayout: GPUPipelineLayout;
    private sceneBindGroup: GPUBindGroup;

    private pipelines = new Map<string, Promise<GPURenderPipeline>>();

    constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat) {
        this.device = device;
        this.context = context;
        this.format = format;

        const sampler: GPUSampler = device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
        });

        this.sceneLayout = device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} }],
        });

        this.planeLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ],
        });

        this.pipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [this.sceneLayout, this.planeLayout],
        });

        this.sceneBindGroup = device.createBindGroup({
            layout: this.sceneLayout,
            entries: [{ binding: 0, resource: sampler }],
        });
    }

    pipelineFor(code: string): Promise<GPURenderPipeline> {
        let pipeline = this.pipelines.get(code);
        if (!pipeline) {
            const module = this.device.createShaderModule({ code });
            pipeline = this.device.createRenderPipelineAsync({
                layout: this.pipelineLayout,
                vertex: { module, entryPoint: "vertexMain" },
                fragment: {
                    module,
                    entryPoint: "fragmentMain",
                    targets: [{ format: this.format, blend: BLEND }],
                },
                primitive: { topology: "triangle-strip" },
            });
            this.pipelines.set(code, pipeline);
        }
        return pipeline;
    }

    createPlaneBindGroup(texture: GPUTexture, uniformBuffer: GPUBuffer): GPUBindGroup {
        return this.device.createBindGroup({
            layout: this.planeLayout,
            entries: [
                { binding: 0, resource: texture.createView() },
                { binding: 1, resource: { buffer: uniformBuffer } },
            ],
        });
    }

    render(records: Iterable<PlaneRecord>): void {
        // console.count("draw");
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: [0, 0, 0, 0], // the page shows through
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        pass.setBindGroup(0, this.sceneBindGroup);

        let current: GPURenderPipeline | null = null;
        for (const record of records) {
            if (!record.bindGroup || !record.pipeline) continue;

            const b = record.bounds;
            if (b.width <= 0 || b.height <= 0) continue;

            if (record.pipeline !== current) {
                pass.setPipeline(record.pipeline);
                current = record.pipeline;
            }

            pass.setBindGroup(1, record.bindGroup);
            pass.draw(4);
        }
        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }
}
