import type { PlaneManager } from "./PlaneManager";
import type { PlaneRecord } from "./records";
import type { EffectSettings, Rect } from "../types";

export class ImagePlane {
    private record: PlaneRecord;
    private manager: PlaneManager;

    readonly ready: Promise<void>;

    constructor(record: PlaneRecord, manager: PlaneManager, ready: Promise<void>) {
        this.record = record;
        this.manager = manager;
        this.ready = ready;
    }

    get bounds(): Rect {
        return this.record.bounds;
    }

    get effects(): Record<string, EffectSettings> {
        return this.record.effects;
    }

    get opacity(): number {
        return this.record.opacity;
    }

    set opacity(value: number) {
        this.record.opacity = value;
    }

    get isTracking(): boolean {
        return this.record.tracking;
    }

    untrack(): void {
        this.record.tracking = false;
    }

    track(element?: HTMLElement): void {
        if (element) {
            this.record.element = element;
        }
        this.record.tracking = true;
    }

    bringToFront(): void {
        this.manager.bringToFront(this.record);
    }

    remove(): void {
        this.manager.remove(this.record);
    }
}
