import { WebGPUCore } from "./WebGPUCore";
import { waitForImageReady } from "./util";
import type { ManagedTexture, PlaneSource } from "../types";

export class TextureManager {
    private core: WebGPUCore;

    constructor(core: WebGPUCore) {
        this.core = core;
    }

    /** Resolve any supported source to an ImageBitmap, then upload it. */
    async load(source: PlaneSource): Promise<ManagedTexture> {
        const bitmap = await this.toBitmap(source);
        return this.createFromBitmap(bitmap);
    }

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

    createFromBitmap(bitmap: ImageBitmap): ManagedTexture {
        const device = this.core.getDevice();

        const texture = device.createTexture({
            size: [bitmap.width, bitmap.height, 1],
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });

        device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
            bitmap.width,
            bitmap.height,
        ]);

        return {
            texture,
            width: bitmap.width,
            height: bitmap.height,
            format: "rgba8unorm",
        };
    }
}
