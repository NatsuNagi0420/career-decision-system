/** 青穗集 · 岗位库专用合成数据：仅测试隔离主库，绝不作为产品缺库时的回退资料。 */
import { createHash } from "node:crypto";
import { catalogueFileSchema, type CatalogueJob } from "../src/job-catalogue-schema.js";
const codes = ["backend", "frontend", "mobile", "data-analysis", "data-engineering", "ai-algorithm", "ai-application", "testing-quality", "devops-security", "product-management", "ux-design", "operations-growth", "marketing-brand", "sales-bd", "customer-success", "finance-accounting", "hr", "legal-compliance", "consulting-research", "education-training", "media-content", "industrial-engineering", "hardware-electronics", "biomedical-health", "public-service"];
function job(id: string, title: string, collected: boolean, patch: Partial<CatalogueJob> = {}): CatalogueJob {
  const description = "【合成测试资料，不是真实招聘】岗位：" + title + "。职责包括需求分析、整理记录、执行验证和团队沟通；需保留实际证据，不虚构经历。不代表当前招聘。".repeat(3);
  return { id, title, company: "合成测试公司", company_normalized: "合成测试公司", city: "北京", locations: ["北京"], search_locations: ["北京"],
    description, raw_description: description, source_url: "https://example.invalid/jobs/" + id, source_job_code: id, source_platform: collected ? "public_web" : "zhaopin", source_domain: "example.invalid", source_type: collected ? "university_job_board" : null,
    data_kind: collected ? "collected" : "historical", captured_at: collected ? "2026-10-24T10:00:00+08:00" : null, published_at: collected ? "2026-08-26" : null, expires_at: null,
    work_type: collected ? "internship" : "unknown", audience_clues: ["internship_mentioned"], education: null, experience_level: null, salary_text: "未知", graduation_eligibility_text: null,
    content_hash: createHash("sha256").update(description).digest("hex"), record_use: collected ? "recent_sample" : "undated_reference", recruitment_status: "unknown",
    collected_direction_code: collected ? "testing-quality" : null, direction_codes: collected ? ["testing-quality"] : [], direction_review_status: "needs_review", direction_basis: collected ? "collector_suggestion" : "legacy_title_rule",
    review_flags: [], review_notes: [], evidence: collected ? [{ field: "title", quote: title }] : [], supplemental_evidence: [], batch_id: collected ? "test-batch" : null,
    source_verification: collected ? "collector_reported" : "legacy_unknown", ...patch };
}
export function catalogueFixture() {
  const jobs = [job("legacy-test-1", "测试工程师", false), job("legacy-test-2", "软件测试实习生", false),
    job("new-frontend", "前端开发实习生", true, { city: "Tianjin CN", locations: ["Tianjin CN"], search_locations: ["天津"], collected_direction_code: "frontend", direction_codes: ["frontend"], review_flags: ["field_conflict"] }),
    job("new-hardware", "电子测试工程师", true, { collected_direction_code: "testing-quality", direction_codes: ["hardware-electronics"], direction_basis: "local_review" }),
    job("new-data", "Data Analyst 实习生", true, { city: "Beijing CN", locations: ["Beijing CN"], search_locations: ["北京"], direction_codes: ["data-analysis"] }),
    job("new-closed", "测试实习已结束", true, { recruitment_status: "closed_explicit", published_at: "2023-08-01", expires_at: "2023-09-30", record_use: "historical_reference" }),
    job("new-expired", "测试实习过期", true, { expires_at: "2026-10-17" })];
  return catalogueFileSchema.parse({ schema_version: 2, version: "synthetic-test-v1", legacy_version: "synthetic-legacy", exported_at: "2026-10-24T10:00:00+08:00", notice: "测试专用：历史样本、状态未知，不是真实在招职位。",
    directions: codes.map(code => ({ code, name: code, summary: "合成测试方向", typical_work: [], common_skills: [], growth_path: [], misconceptions: [], content_type: "curated_reference", review_status: "needs_review" })), jobs,
    batches: [{ id: "test-batch", archive_sha256: "a".repeat(64), source_rows: 6, retained_jobs: 5, quarantined_jobs: 1, duplicate_jobs: 0, leads: 2, captured_from: "2026-10-24T10:00:00+08:00", captured_to: "2026-10-24T10:00:00+08:00", review_rules_hash: "b".repeat(64), source_verification: "collector_reported" }],
    source_stats: { source_rows: 8, retained_jobs: 7, excluded_jobs: 1, exclusion_reasons: { test_quarantine: 1 } } });
}
