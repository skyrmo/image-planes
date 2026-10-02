import { VERTEX_SOURCE, FRAGMENT_SOURCE } from "../shaders/sources";
import type { PlaneRecord } from "./records";

export class Renderer {
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private pipeline: GPURenderPipeline;

    private sceneLayout: GPUBindGroupLayout;
    private planeLayout: GPUBindGroupLayout;
    private pipelineLayout: GPUPipelineLayout;
    private sceneBindGroup: GPUBindGroup;

    constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat) {
        this.device = device;
        this.context = context;

        this.sceneLayout = device.createBindGroupLayout({ entries: [] });
        this.planeLayout = device.createBindGroupLayout({
            entries: [
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

        this.sceneBindGroup = device.createBindGroup({ layout: this.sceneLayout, entries: [] });

        this.pipeline = device.createRenderPipeline({
            layout: this.pipelineLayout,
            vertex: {
                module: device.createShaderModule({ code: VERTEX_SOURCE }),
                entryPoint: "vertexMain",
            },
            fragment: {
                module: device.createShaderModule({ code: FRAGMENT_SOURCE }),
                entryPoint: "fragmentMain",
                targets: [
                    {
                        format,
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
            primitive: { topology: "triangle-strip" },
        });
    }

    createPlaneBindGroup(uniformBuffer: GPUBuffer): GPUBindGroup {
        return this.device.createBindGroup({
            layout: this.planeLayout,
            entries: [{ binding: 1, resource: { buffer: uniformBuffer } }],
        });
    }

    render(records: Iterable<PlaneRecord>): void {
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
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.sceneBindGroup);
        for (const record of records) {
            if (!record.bindGroup) continue;
            pass.setBindGroup(1, record.bindGroup);
            pass.draw(4);
        }
        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }
}
