/** 青穗集 · 岗位参考库共享契约：来源与日期独立保存，采集记录不等于实时招聘状态。 */
export type RecruitmentStatus = "unknown" | "open_explicit" | "closed_explicit";
export type JobRecordUse = "recent_sample" | "undated_reference" | "historical_reference";
export interface JobSampleOrigin {
  catalogue_id: string;
  catalogue_version: string;
  content_hash: string;
  source_platform: "zhaopin" | "public_web";
  data_kind: "historical" | "collected";
  captured_at: string | null;
  city: string;
  // Optional for user-saved legacy snapshots; newly saved references always carry these values.
  published_at?: string | null;
  expires_at?: string | null;
  recruitment_status?: RecruitmentStatus;
  record_use?: JobRecordUse;
  source_type?: string | null;
  source_verification?: "legacy_unknown" | "collector_reported";
  review_flags?: string[];
}
export interface CatalogueSelection {
  title: string;
  company: string;
  url: string;
  description: string;
  catalogue: JobSampleOrigin;
}
export function catalogueReferenceDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function catalogueAvailability(origin: Pick<JobSampleOrigin, "expires_at" | "recruitment_status">, day = catalogueReferenceDay()): "closed" | "past_deadline" | "unverified" {
  if (origin.recruitment_status === "closed_explicit") return "closed";
  if (origin.expires_at && origin.expires_at < day) return "past_deadline";
  return "unverified";
}
export function catalogueReferenceNotice(origin: JobSampleOrigin, day = catalogueReferenceDay()): string {
  const state = catalogueAvailability(origin, day);
  if (state === "closed") return "岗位已关闭，仅作历史参考。";
  if (state === "past_deadline") return "已过截止日期（" + origin.expires_at + "），仅作历史参考。";
  if (origin.data_kind === "historical") return "历史样本 · 采集时间未知，不保证仍在招聘。";
  const dates = [origin.published_at ? "发布 " + origin.published_at : "发布日期未知",
    origin.captured_at ? "采集 " + origin.captured_at.slice(0, 10) : "采集时间未知"];
  return "岗位参考 · " + dates.join(" · ") + " · "
    + (origin.recruitment_status === "open_explicit" ? "采集时页面标注开放，当前状态需核实。" : "不保证仍在招聘。")
    + (origin.review_flags?.includes("field_conflict") ? " 字段有冲突，请核对原文。" : "");
}
