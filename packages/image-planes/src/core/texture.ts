import type { PlaneSource } from "../types";
import { waitForImageReady } from "../utils";

async function toBitmap(source: PlaneSource): Promise<ImageBitmap> {
    if (source instanceof ImageBitmap) return source;

    if (source instanceof HTMLImageElement) {
        await waitForImageReady(source);
        return createImageBitmap(source); // reuses the already-downloaded pixels
    }

    if (typeof source === "string") {
        const response = await fetch(source);
        if (!response.ok) throw new Error(`Failed to load image: ${source}`);
        return createImageBitmap(await response.blob());
    }

    return createImageBitmap(source); // Blob
}

export async function loadTexture(device: GPUDevice, source: PlaneSource) {
    const bitmap = await toBitmap(source);
    const texture = device.createTexture({
        size: [bitmap.width, bitmap.height],
        format: "rgba8unorm",
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture, premultipliedAlpha: true },
        [bitmap.width, bitmap.height],
    );

    return { texture, aspect: bitmap.width / bitmap.height };
}
