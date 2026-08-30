import { waitForImageReady } from "./util";
import type { PlaneSource } from "../types";
import type { ManagedTexture } from "./records";

export class TextureManager {
    private device: GPUDevice;

    constructor(device: GPUDevice) {
        this.device = device;
    }

    /** Resolve any supported source to an ImageBitmap. */
    private async toBitmap(source: PlaneSource): Promise<ImageBitmap> {
        if (source instanceof ImageBitmap) return source;

        if (source instanceof HTMLImageElement) {
            // Use the element's already-decoded pixels — no re-fetch.
            await waitForImageReady(source);
            return createImageBitmap(source);
        }

        if (typeof source === "string") {
            const response = await fetch(source);
            if (!response.ok) {
                throw new Error(`Failed to load image: ${source}`);
            }
            return createImageBitmap(await response.blob());
        }

        return createImageBitmap(source);
    }

    /** Resolve any supported source to an ImageBitmap, then upload it. */
    async load(source: PlaneSource): Promise<ManagedTexture> {
        const bitmap = await this.toBitmap(source);
        return this.createTexture(bitmap);
    }

    createTexture(bitmap: ImageBitmap): ManagedTexture {
        const texture = this.device.createTexture({
            size: [bitmap.width, bitmap.height, 1],
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture, premultipliedAlpha: true },
            [bitmap.width, bitmap.height],
        );

        return {
            texture,
            width: bitmap.width,
            height: bitmap.height,
            format: "rgba8unorm",
        };
    }
}
