/** Everything a scene needs from WebGPU — all of it non-null by construction. */
export interface WebGPUSetup {
    device: GPUDevice;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
}

/**
 * Acquire a device and a configured canvas context. Async, which is the whole
 * reason `ImagePlanes` is built through `ImagePlanes.create()` rather than
 * `new` — a constructor cannot await, so anything it builds would have to
 * tolerate a null device until this resolved.
 *
 * Throws `WebGPUUnsupportedError` when the machine can't do WebGPU at all (the
 * graceful-degradation signal) and `WebGPUInitError` when it can but setup failed.
 */
export async function initWebGPU(canvas: HTMLCanvasElement): Promise<WebGPUSetup> {
    // No navigator.gpu and no adapter both mean "this machine can't" —
    // the graceful degradation path. Everything below them is a real fault.
    if (!navigator.gpu) {
        throw new Error("WebGPU is not available in this browser");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("No WebGPU adapter is available on this machine");
    }

    let device: GPUDevice;
    try {
        device = await adapter.requestDevice();
    } catch (cause) {
        throw new Error("Failed to create a WebGPU device", { cause });
    }

    const context = canvas.getContext("webgpu");
    if (!context) {
        throw new Error('The canvas would not return a "webgpu" context');
    }

    const format = navigator.gpu.getPreferredCanvasFormat();

    configureCanvas(canvas, context, device, format);

    return { device, context, format };
}

/**
 * Size the canvas to the viewport in device pixels and (re)configure its
 * swapchain. Called once at startup and again on every resize.
 */
export function configureCanvas(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    format: GPUTextureFormat,
): void {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(window.innerWidth * dpr));
    const height = Math.max(1, Math.floor(window.innerHeight * dpr));

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    context.configure({
        device,
        format,
        alphaMode: "premultiplied",
    });
}
