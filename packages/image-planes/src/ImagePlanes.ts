import { initWebGPU } from "./core/gpu";
import { PlaneManager } from "./core/PlaneManager";
import { Renderer } from "./core/Renderer";
import type { AddPlaneOptions } from "./types/types";

export class ImagePlanes {
    private canvas: HTMLCanvasElement;
    private context: GPUCanvasContext;
    private device: GPUDevice;
    private format: GPUTextureFormat;
    private renderer: Renderer;
    private planeManager: PlaneManager;

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
        this.planeManager = new PlaneManager(this.device, this.renderer);
    }

    addPlane(options: AddPlaneOptions): void {
        this.planeManager.createRecord(options.element);
        this.planeManager.update();
        this.renderer.render(this.planeManager.records);
    }
}
