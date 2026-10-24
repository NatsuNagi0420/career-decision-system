/** 青穗集 · 涟漪回归：点击映射、覆盖半径、键盘激活及鼠标事件去重。 */
import { describe, expect, it } from "vitest";
import { isRippleActivation, rippleGeometry, RIPPLE_DURATION } from "./buttonRipples";
const rect = { left: 100, top: 50, width: 200, height: 40 };
describe("按钮涟漪坐标", () => {
  it("鼠标点击从点击位置扩散，圆波覆盖最远角", () => {
    const result = rippleGeometry(rect, 200, 40, { x: 110, y: 60 })!;
    expect(result.x).toBe(10);
    expect(result.y).toBe(10);
    expect(result.diameter).toBe(Math.ceil(2 * Math.hypot(190, 30)));
  });
  it("键盘激活从按钮中心扩散", () => {
    expect(rippleGeometry(rect, 200, 40)).toEqual({ x: 100, y: 20, diameter: Math.ceil(2 * Math.hypot(100, 20)) });
  });
  it("按钮缩放时映射回局部坐标，越界坐标钳制到边缘", () => {
    expect(rippleGeometry(rect, 400, 80, { x: 150, y: 60 })).toMatchObject({ x: 100, y: 20 });
    expect(rippleGeometry(rect, 200, 40, { x: -10, y: 200 })).toMatchObject({ x: 0, y: 40 });
  });
  it("隐藏、无尺寸或非有限坐标不创建涟漪", () => {
    expect(rippleGeometry(rect, 0, 40)).toBeNull();
    expect(rippleGeometry({ ...rect, width: 0 }, 200, 40)).toBeNull();
    expect(rippleGeometry(rect, 200, 40, { x: NaN, y: 10 })).toBeNull();
    expect(rippleGeometry({ ...rect, left: Infinity }, 200, 40)).toBeNull();
  });
});
describe("按钮涟漪激活", () => {
  it("只处理主指针的主键，兼容鼠标、触摸和笔", () => {
    expect(isRippleActivation({ type: "pointerdown", button: 0, isPrimary: true })).toBe(true);
    expect(isRippleActivation({ type: "pointerdown", button: 2 })).toBe(false);
    expect(isRippleActivation({ type: "pointerdown", button: 0, isPrimary: false })).toBe(false);
  });
  it("鼠标 click 不重复，键盘和辅助技术 click 正常触发", () => {
    expect(isRippleActivation({ type: "click", detail: 1 })).toBe(false);
    expect(isRippleActivation({ type: "click", detail: 0 })).toBe(true);
    expect(isRippleActivation({ type: "keydown", detail: 0 })).toBe(false);
  });
  it("反馈不使用过长动画", () => {
    expect(RIPPLE_DURATION).toBeGreaterThanOrEqual(500);
    expect(RIPPLE_DURATION).toBeLessThanOrEqual(700);
  });
});
