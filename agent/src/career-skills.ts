/** 青穗集 · 技能实践记录契约：等级表达本人确认的经历阶段，必须保留可回看的原文依据。 */
import { z } from "zod";
export const careerSkillInput = z.object({
  name: z.string().trim().min(1).max(80),
  stage: z.enum(["contact", "project", "independent"]),
  evidence: z.array(z.object({ source_id: z.string().min(1).max(100), quote: z.string().trim().min(1).max(2000) }).strict()).min(1).max(5),
}).strict();
export type CareerSkill = z.infer<typeof careerSkillInput> & { confirmed_at: string };
