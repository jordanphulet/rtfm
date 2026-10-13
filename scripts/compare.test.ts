import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { compareImages } from "./compare.ts";

const GRAY = 128;

function grayImage(width: number, height: number, paint: (x: number, y: number) => number = () => GRAY): PNG {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = paint(x, y);
      image.data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  return image;
}

describe("compareImages", () => {
  it("matches identical images", () => {
    const comparison = compareImages(grayImage(8, 8), grayImage(8, 8));
    expect(comparison).toMatchObject({ differingPixels: 0, withinTolerance: true });
  });

  it("lets every pixel drift by two color steps", () => {
    const drifted = grayImage(8, 8, () => GRAY + 2);
    expect(compareImages(drifted, grayImage(8, 8))).toMatchObject({ differingPixels: 0, withinTolerance: true });
  });

  it("allows a few pixels to differ", () => {
    const speckled = grayImage(8, 8, (x, y) => (x === y ? 0 : GRAY));
    expect(compareImages(speckled, grayImage(8, 8))).toMatchObject({ differingPixels: 8, withinTolerance: true });
  });

  it("reports a changed region", () => {
    const changed = grayImage(8, 8, (x) => (x < 4 ? 0 : GRAY));
    expect(compareImages(changed, grayImage(8, 8))).toMatchObject({ differingPixels: 32, withinTolerance: false });
  });

  it("counts the pixels a size change adds", () => {
    const comparison = compareImages(grayImage(8, 10), grayImage(8, 8));
    expect(comparison).toMatchObject({ differingPixels: 16, withinTolerance: false });
    expect([comparison.diff.width, comparison.diff.height]).toEqual([8, 10]);
  });
});
