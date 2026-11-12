/** 青穗集 · 入门教学布局回归：真实目标、窄屏／4K、自适应定位和分账号缓存。 */
import { describe, expect, it } from "vitest";
import { clipTourTarget, onboardingCacheKey, onboardingSteps, placeTourPanel } from "./onboarding";
describe("穗奈特色体验引导", () => {
  it("云端与本机只介绍实际提供的入口", () => {
    const cloud = onboardingSteps("server"), local = onboardingSteps("local");
    expect(cloud.map(step => step.id)).toEqual(["chat", "upload", "workbench", "learning", "resume", "memory"]);
    expect(cloud.map(step => step.text).join("")).not.toMatch(/本机项目|文件夹入口|完全访问/);
    expect(local[1].text).toContain("本机项目");
  });
  it("输入框上方放说明，不覆盖正在介绍的输入区域", () => {
    const target = { x: 320, y: 790, width: 700, height: 100 };
    const panel = placeTourPanel(target, { width: 1440, height: 960 }, { width: 432, height: 240 }, "top");
    expect(panel.side).toBe("top"); expect(panel.y + 240).toBeLessThan(target.y);
    expect(panel.x).toBeGreaterThanOrEqual(12);
  });
  it("桌面工作台在右侧解释，4K 不出现远离目标的居中弹窗", () => {
    const target = { x: 40, y: 140, width: 240, height: 72 };
    const panel = placeTourPanel(target, { width: 3840, height: 2160 }, { width: 432, height: 240 }, "right");
    expect(panel.side).toBe("right"); expect(panel.x).toBe(300);
  });
  it("窄屏顶部工作台入口自动把说明放到下方", () => {
    const target = { x: 285, y: 20, width: 40, height: 40 };
    const panel = placeTourPanel(target, { width: 390, height: 844 }, { width: 366, height: 260 }, "right");
    expect(panel.side).toBe("bottom"); expect(panel.x).toBe(12);
    expect(panel.x + 366).toBeLessThanOrEqual(378);
  });
  it("横屏空间不足和目标缺失也不让气泡跑出可见区域", () => {
    for (const target of [null, { x: 120, y: 60, width: 600, height: 240 }]) {
      const panel = placeTourPanel(target, { width: 740, height: 360 }, { width: 432, height: 240 }, "top");
      expect(panel.x).toBeGreaterThanOrEqual(12); expect(panel.y).toBeGreaterThanOrEqual(12);
      expect(panel.y + 240).toBeLessThanOrEqual(348);
    }
  });
  it("高亮裁剪到视口，完全隐藏的入口不会变成错误热点", () => {
    expect(clipTourTarget({ x: -8, y: 800, width: 100, height: 100 }, { width: 390, height: 844 })).toEqual({ x: 6, y: 793, width: 93, height: 45 });
    expect(clipTourTarget({ x: 1000, y: 100, width: 20, height: 20 }, { width: 390, height: 844 })).toBeNull();
  });
  it("不同账号和运行形态的浏览器兜底记录互不混用", () => {
    expect(onboardingCacheKey(1, "local")).not.toBe(onboardingCacheKey(2, "local"));
    expect(onboardingCacheKey(1, "local")).not.toBe(onboardingCacheKey(1, "server"));
  });
});
