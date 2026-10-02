export interface WebGPUSetup {
    device: GPUDevice;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
}

export async function initWebGPU(canvas: HTMLCanvasElement): Promise<WebGPUSetup> {
    if (!navigator.gpu) throw new Error("WebGPU is not available in this browser");

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter is available on this machine");

    const device = await adapter.requestDevice();

    // capture and log async WebGPU errors. without this webgpu fails silently.
    device.addEventListener("uncapturederror", (event) => {
        console.error("[image-planes]", (event as GPUUncapturedErrorEvent).error.message);
    });

    const context = canvas.getContext("webgpu");
    if (!context) throw new Error('The canvas would not return a "webgpu" context');

    // The pixel format this screen prefers. Using it avoids a conversion step.
    const format = navigator.gpu.getPreferredCanvasFormat();
    configureCanvas(canvas, context, device, format);
    return { device, context, format };
}

export function configureCanvas(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    format: GPUTextureFormat,
): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    context.configure({ device, format, alphaMode: "premultiplied" });
}
