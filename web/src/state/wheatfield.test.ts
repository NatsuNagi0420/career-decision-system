import { describe, expect, it } from "vitest";
import { LAYERS, wavePath } from "../components/WheatField";

/** The points before the band is closed off at the bottom — the path always ends with
 *  the two corners, so dropping the last two leaves the ridge itself. */
function ridge(layer: (typeof LAYERS)[number]): Array<[number, number]> {
  const pairs = wavePath(layer).match(/[\d.]+ [\d.]+/g) ?? [];
  return pairs.slice(0, -2).map((pair) => pair.split(" ").map(Number) as [number, number]);
}

describe("the wheat field", () => {
  it("repeats itself across the distance it actually travels", () => {
    // The element is 200% wide and slides -50%, so what shows after one loop is the
    // right half of the path. Unless the right half equals the left half, the field
    // visibly jumps once per cycle — and nothing else here would notice.
    for (const layer of LAYERS) {
      expect(layer.cycles % 2).toBe(0);
      const points = ridge(layer);
      expect(points.length).toBeGreaterThan(40);
      const half = (points.length - 1) / 2;
      for (let index = 0; index <= half; index += 1) {
        expect(points[index][1]).toBeCloseTo(points[index + half][1], 1);
      }
    }
  });

  it("does have teeth: a layer with a half period left would jump at the seam", () => {
    // Without this, the check above could be passing on a parser that reads nothing at
    // all. 3 cycles across a 200%-wide element is 1.5 periods per viewport.
    const points = ridge({ ...LAYERS[0], cycles: 3 });
    const half = (points.length - 1) / 2;
    const mismatches = points.slice(0, half).filter((point, index) => point[1] !== points[index + half][1]);
    expect(mismatches.length).toBeGreaterThan(half * 0.5);
  });

  it("keeps the far rows bigger and slower than the near ones", () => {
    const amps = LAYERS.map((layer) => layer.amp);
    const seconds = LAYERS.map((layer) => layer.seconds);
    expect(amps).toEqual([...amps].sort((left, right) => right - left));
    expect(seconds).toEqual([...seconds].sort((left, right) => right - left));
  });

  it("never lets a ridge touch the top or spill past the bottom of its box", () => {
    for (const layer of LAYERS) {
      for (const [, y] of ridge(layer)) {
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(200);
      }
    }
  });
});
