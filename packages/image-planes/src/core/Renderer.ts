import { VERTEX_SOURCE, FRAGMENT_SOURCE } from "../shaders/sources";

export class Renderer {
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private pipeline: GPURenderPipeline;

    constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat) {
        this.device = device;
        this.context = context;
        this.pipeline = device.createRenderPipeline({
            layout: "auto", // replaced in step 3
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

    render(): void {
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
        pass.draw(4);
        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }
}
