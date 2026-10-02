import { initWebGPU } from "./core/gpu";

export class ImagePlanes {
    private canvas: HTMLCanvasElement;
    private context: GPUCanvasContext;
    private device: GPUDevice;
    private format: GPUTextureFormat;

    static async create(canvas: HTMLCanvasElement): Promise<ImagePlanes> {
        const { device, context, format } = await initWebGPU(canvas);
        return new ImagePlanes(canvas, device, context, format);
    }

    private constructor(
        canvas: HTMLCanvasElement,
        device: GPUDevice,
        context: GPUCanvasContext,
        format: GPUTextureFormat,
    ) {
        this.canvas = canvas;
        this.device = device;
        this.context = context;
        this.format = format;

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(), // "draw onto the canvas"
                    clearValue: [0, 0, 0.3, 0.3], // premultiplied red at 30%: r ≤ a!
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        pass.end();
        device.queue.submit([encoder.finish()]);
    }
}
