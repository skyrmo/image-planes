import type { Brick } from "../types";

export const PLANE_BASE_FLOATS = 10;

export interface SettingSlot {
    brick: string;
    setting: string;
    field: string;
}

/**
 * Every setting of every brick, in the order they sit in the plane's buffer.
 * buildShader uses it to write the struct, and PlaneManager uses it to fill the
 * buffer. Because both use this one function, they can never disagree.
 */
export function listSettings(bricks: Brick[]): SettingSlot[] {
    const slots: SettingSlot[] = [];
    for (const brick of bricks) {
        for (const setting of Object.keys(brick.settings)) {
            slots.push({ brick: brick.name, setting, field: `${brick.name}_${setting}` });
        }
    }
    return slots;
}

/** How many floats a plane's buffer needs: base + settings, rounded up to a whole 16-byte block. */
export function planeFloats(settingCount: number): number {
    return Math.ceil((PLANE_BASE_FLOATS + settingCount) / 4) * 4;
}
