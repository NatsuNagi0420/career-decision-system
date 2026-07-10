# Database Job Schema Review

This review compares the new `career_decision_system` schema with the old real-job dataset in `SQL脚本/career_db.sql`.

## Source Data

Real job source table:

- Old table: `career_db.t_2025_multi_area_job_info`
- Rows in SQL dump: 800
- ID range: 101 to 9000, with gaps
- Current unique key in old table: `(company_name, job_name, update_date, salary_range)`

Old table columns:

- `job_name`
- `company_name`
- `update_date`
- `salary_range`
- `location`
- `industry`
- `company_size`
- `company_type`
- `job_code`
- `job_details`
- `company_details`
- `job_source_url`

## Data Quality Findings

- `job_code` has 799 unique values across 800 rows. One source code appears twice with different job titles, so the new `jobs` unique key cannot rely only on `(source_platform, source_job_code)`.
- `company_type` is null in 235 rows.
- `company_details` is null in 119 rows.
- `job_details` is null in 5 rows.
- 35 rows contain a location district of `None`, for example `东莞-None`.
- 641 rows contain HTML `<br>` in `job_details`.
- Salary text is mixed:
  - `7000-10000元`: 544 rows
  - `1-2万`: 101 rows
  - `8000-12000元·15薪`: 63 rows
  - `3-3.5万·13薪`: 50 rows
  - `150-200元/天`: 31 rows
  - `面议`: 11 rows

## Current New Schema Assessment

The current `jobs` table is a good clean business table. It already covers the core fields:

- source code/platform
- title/company/city/location
- industry/company size/financing stage
- salary min/max/text
- description/company description/source URL
- status and timestamps

But it is not enough for stable real-job import and later AI recommendation. Missing pieces:

- raw source preservation
- import batch tracking
- source row hash for reliable deduplication
- district normalization
- salary period/month count parsing
- normalized title/company fields
- quality score
- search text and embedding status

## Recommendation

Do not import the old database wholesale. The old SQL also contains old user, token, MBTI, report archive, and backup tables. Only use `t_2025_multi_area_job_info` as source data. Keep `SQL脚本/career_db.sql` as reference-only; production import scripts must stay UTF-8 clean and are scanned by `scripts/verify-all.ps1`.

Keep this layered model:

1. `job_import_batches`: records each import operation.
2. `job_raw_records`: stores raw source rows exactly as imported.
3. `jobs`: stores cleaned and API-facing job records.
4. `job_tags` / `job_tag_rel`: continue to store skills, industries, and generated tags.

## Execution Order

1. Confirm current new database `career_decision_system` is already initialized.
2. Run `SQL脚本/01_job_import_schema_upgrade.sql` on `career_decision_system`.
3. Run `SQL脚本/02_import_old_career_db_jobs.sql`, which now directly inserts the 800 real job rows and does not require an old `career_db` schema.
4. Verify job count and facets from backend `/api/v1/jobs`.

This keeps the new system clean while allowing the real job data to remain traceable back to the old source rows.
