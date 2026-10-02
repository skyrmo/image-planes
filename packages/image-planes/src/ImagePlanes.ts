import { initWebGPU } from "./core/gpu";
import { Renderer } from "./core/Renderer";

export class ImagePlanes {
    private canvas: HTMLCanvasElement;
    private context: GPUCanvasContext;
    private device: GPUDevice;
    private format: GPUTextureFormat;
    private renderer: Renderer;

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
        this.renderer = new Renderer(device, context, format);

        this.renderer.render();
    }
}
