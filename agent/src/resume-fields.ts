/** 青穗集 · 简历字段定位：纸面与服务端共享稳定字段路径，局部改写只触及明确选中的文字。 */
import type { ResumeHeader, ResumeBody } from "./resume-contract.js";
export interface ResumeEditRequest { revision: number; field_ids: string[] }
export interface ResumeField { id: string; label: string; text: string; max: number; fact_ids: string[] }
export interface ResumeFieldChange { field_id: string; text: string }
const labels = { education: "教育背景", experience: "工作与实践", projects: "项目经历", skills: "专业技能" };
export function resumeFields(header: ResumeHeader, body: ResumeBody): ResumeField[] {
  const fields: ResumeField[] = [
    { id: "header.name", label: "姓名", text: header.name, max: 80, fact_ids: [] },
    { id: "header.headline", label: "求职方向", text: header.headline, max: 120, fact_ids: [] },
    { id: "header.contact", label: "联系方式", text: header.contact, max: 500, fact_ids: [] },
    { id: "summary.text", label: "个人简介", text: body.summary.text, max: 700, fact_ids: body.summary.fact_ids },
  ];
  for (const section of body.sections) section.entries.forEach((entry, index) => {
    const prefix = section.kind + "." + index, label = labels[section.kind] + " · " + entry.title;
    for (const key of ["title", "subtitle", "period"] as const) fields.push({ id: prefix + "." + key, label, text: entry[key], max: key === "title" ? 180 : key === "subtitle" ? 240 : 100, fact_ids: entry.fact_ids });
    entry.bullets.forEach((text, bullet) => fields.push({ id: prefix + ".bullets." + bullet, label, text, max: 1200, fact_ids: entry.fact_ids }));
  });
  return fields.filter(field => field.text.trim());
}
export function patchResumeFields(header: ResumeHeader, body: ResumeBody, changes: ResumeFieldChange[]) {
  const next = structuredClone({ header, body });
  for (const change of changes) {
    const [area, index, key, bullet] = change.field_id.split(".");
    if (area === "header" && ["name", "headline", "contact"].includes(index)) next.header[index as keyof ResumeHeader] = change.text;
    else if (change.field_id === "summary.text") next.body.summary.text = change.text;
    else {
      const entry = next.body.sections.find(section => section.kind === area)?.entries[Number(index)];
      if (!entry) throw new Error("简历字段已变化，请重新框选。");
      if (key === "bullets" && /^\d+$/.test(bullet ?? "") && Number(bullet) < entry.bullets.length) entry.bullets[Number(bullet)] = change.text;
      else if (["title", "subtitle", "period"].includes(key)) entry[key as "title" | "subtitle" | "period"] = change.text;
      else throw new Error("无法修改这个简历字段。");
    }
  }
  return next;
}
