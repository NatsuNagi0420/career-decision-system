/** 青穗集 · 岗位数据库导入交换格式校验：事实证据、来源类型、批次和计数必须相互一致，拒绝静默降级。 */
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const timestamp = z.string().refine(value => /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));
const evidence = z.object({ field: z.string().min(1), quote: z.string().min(1) }).strict();
const sourceTypes = z.enum(["official_employer", "employer_ats", "university_job_board", "government_job_board", "other_public"]);
const direction = z.object({
  code: z.string(), name: z.string(), summary: z.string(), typical_work: z.array(z.string()),
  common_skills: z.array(z.string()), growth_path: z.array(z.string()), misconceptions: z.array(z.string()),
  content_type: z.literal("curated_reference"), review_status: z.literal("needs_review"),
});
export const catalogueJobSchema = z.object({
  id: z.string().min(1).max(80), title: z.string().min(1).max(120), company: z.string().max(120), company_normalized: z.string(),
  city: z.string(), locations: z.array(z.string()), search_locations: z.array(z.string()),
  description: z.string().min(80).max(12000), raw_description: z.string(), source_url: z.string().max(2000),
  source_job_code: z.string(), source_platform: z.enum(["zhaopin", "public_web"]), source_domain: z.string(), source_type: sourceTypes.nullable(),
  data_kind: z.enum(["historical", "collected"]), captured_at: timestamp.nullable(), published_at: date.nullable(), expires_at: date.nullable(),
  work_type: z.enum(["unknown", "internship", "campus", "experienced"]), audience_clues: z.array(z.string()),
  education: z.string().nullable(), experience_level: z.string().nullable(), salary_text: z.string(), graduation_eligibility_text: z.string().nullable(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/), record_use: z.enum(["recent_sample", "undated_reference", "historical_reference"]),
  recruitment_status: z.enum(["open_explicit", "closed_explicit", "unknown"]),
  collected_direction_code: z.string().nullable(), direction_codes: z.array(z.string()),
  direction_review_status: z.enum(["unreviewed", "needs_review"]), direction_basis: z.enum(["legacy_title_rule", "collector_suggestion", "local_review"]),
  review_flags: z.array(z.string()), review_notes: z.array(z.string()), evidence: z.array(evidence), supplemental_evidence: z.array(evidence),
  batch_id: z.string().nullable(), source_verification: z.enum(["legacy_unknown", "collector_reported"]),
}).superRefine((job, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
  if (job.source_url && (!URL.canParse(job.source_url) || !/^https?:\/\//i.test(job.source_url))) invalid("Invalid source URL");
  if (job.source_url && URL.canParse(job.source_url)) {
    const url = new URL(job.source_url);
    if (url.username || url.password || url.hostname !== job.source_domain) invalid("Source domain or credentials mismatch");
  }
  if (job.source_platform === "zhaopin") {
    if (job.data_kind !== "historical" || job.captured_at !== null || job.batch_id !== null || job.source_verification !== "legacy_unknown") invalid("Invalid legacy provenance");
  } else {
    if (job.data_kind !== "collected" || !job.captured_at || !job.source_url || !job.source_type || !job.batch_id || job.source_verification !== "collector_reported") invalid("Incomplete collected provenance");
    if (job.description !== job.raw_description) invalid("Collected JD must preserve raw text");
    if (!job.evidence.length) invalid("Collected reference is missing evidence");
    if (job.published_at && job.captured_at && job.published_at > job.captured_at.slice(0, 10)) invalid("Future publication date");
    if (job.record_use === "undated_reference" && job.published_at !== null || job.record_use !== "undated_reference" && job.published_at === null) invalid("Publication classification mismatch");
  }
  if ([...job.evidence, ...job.supplemental_evidence].some(item => !job.raw_description.includes(item.quote))) invalid("Evidence not in raw JD");
  if (new Set(job.direction_codes).size !== job.direction_codes.length) invalid("Duplicate directions");
});
export type CatalogueJob = z.infer<typeof catalogueJobSchema>;
const batch = z.object({
  id: z.string(), archive_sha256: z.string().regex(/^[a-f0-9]{64}$/), source_rows: z.number().int().nonnegative(),
  retained_jobs: z.number().int().nonnegative(), quarantined_jobs: z.number().int().nonnegative(), duplicate_jobs: z.number().int().nonnegative(),
  leads: z.number().int().nonnegative(), captured_from: timestamp, captured_to: timestamp,
  review_rules_hash: z.string().regex(/^[a-f0-9]{64}$/), source_verification: z.literal("collector_reported"),
});
export const catalogueFileSchema = z.object({
  schema_version: z.literal(2), version: z.string(), legacy_version: z.string(), exported_at: timestamp, notice: z.string(),
  directions: z.array(direction), jobs: z.array(catalogueJobSchema), batches: z.array(batch),
  source_stats: z.object({ source_rows: z.number().int().nonnegative(), retained_jobs: z.number().int().nonnegative(),
    excluded_jobs: z.number().int().nonnegative(), exclusion_reasons: z.record(z.string(), z.number().int().nonnegative()) }),
}).superRefine((file, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
  const stats = file.source_stats;
  if (file.jobs.length !== stats.retained_jobs || stats.source_rows !== stats.retained_jobs + stats.excluded_jobs || new Set(file.jobs.map(j => j.id)).size !== file.jobs.length) invalid("Catalogue counts do not reconcile");
  const directions = new Set(file.directions.map(d => d.code)), batches = new Map(file.batches.map(b => [b.id, b]));
  if (directions.size !== file.directions.length || batches.size !== file.batches.length) invalid("Duplicate direction or batch");
  for (const job of file.jobs) {
    if (job.direction_codes.some(code => !directions.has(code))) invalid("Unknown direction");
    if (job.batch_id && !batches.has(job.batch_id)) invalid("Missing source batch");
  }
  for (const b of file.batches) {
    if (b.source_rows !== b.retained_jobs + b.quarantined_jobs + b.duplicate_jobs || file.jobs.filter(j => j.batch_id === b.id).length !== b.retained_jobs) invalid("Batch counts do not reconcile");
  }
});
