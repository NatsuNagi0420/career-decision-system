/** 青穗集 · 岗位来源提示回归：真实采集日期、历史兼容、关闭/截止边界和字段冲突均需可见。 */
import { describe, expect, it } from "vitest";
import { catalogueAvailability, catalogueReferenceDay, catalogueReferenceNotice, type JobSampleOrigin } from "../../../agent/src/job-catalogue-contract";

const origin: JobSampleOrigin = { catalogue_id: "test-reference", catalogue_version: "test", content_hash: "test",
  source_platform: "public_web", data_kind: "collected", city: "北京", captured_at: "2026-10-24T10:47:50+08:00",
  published_at: "2026-08-26", expires_at: null, recruitment_status: "unknown", source_verification: "collector_reported" };

describe("工作台岗位参考来源提示", () => {
  it("新批次显示真实日期，不被一律写成采集时间未知", () => {
    const text = catalogueReferenceNotice(origin, "2026-10-24");
    expect(text).toContain("发布 2026-08-26"); expect(text).toContain("采集 2026-10-24");
    expect(text).toContain("不保证仍在招聘"); expect(text).not.toContain("采集时间未知");
  });
  it("已保存的旧来源没有新字段仍能正确展示", () => {
    expect(catalogueReferenceNotice({ catalogue_id: "legacy", catalogue_version: "old", content_hash: "hash", source_platform: "zhaopin", data_kind: "historical", captured_at: null, city: "北京" })).toContain("历史样本 · 采集时间未知");
  });
  it("过去截止日及明确关闭优先于采集时开放，不用unknown掩盖已知截止事实", () => {
    const expired = { ...origin, expires_at: "2026-10-17", recruitment_status: "unknown" as const };
    expect(catalogueAvailability(expired, "2026-10-24")).toBe("past_deadline");
    expect(catalogueReferenceNotice(expired, "2026-10-24")).toContain("已过截止日期");
    expect(catalogueReferenceNotice({ ...origin, recruitment_status: "closed_explicit" }, "2026-10-24")).toContain("岗位已关闭");
    expect(catalogueReferenceNotice({ ...origin, recruitment_status: "open_explicit" }, "2026-10-24")).toContain("当前状态需核实");
  });
  it("字段冲突可见，日期按中国招聘参考时区计算", () => {
    expect(catalogueReferenceNotice({ ...origin, review_flags: ["field_conflict"] }, "2026-10-24")).toContain("字段有冲突");
    expect(catalogueReferenceDay(new Date("2026-10-24T16:00:00Z"))).toBe("2026-10-25");
  });
});
