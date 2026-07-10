# Database Design

## Decision

Use a new MySQL database:

```text
career_decision_system
```

The old SQL file in `SQL脚本/career_db.sql` should be treated as a reference source, not as the production schema. Production initialization and import scripts under `SQL脚本` are covered by the text-encoding scan in `scripts/verify-all.ps1`; the old dump is excluded because it is reference-only.

Reasons:

- Old tables mix business data, backup tables, and raw crawled job data.
- Some backup tables use MyISAM and older charset settings.
- The old `user` table name is too generic and conflicts with common naming conventions.
- Report data is stored as one large JSON blob without type, summary, source run, or lifecycle fields.
- The new architecture needs first-class Agent run records, resume analysis, path planning, chat history, and report archives.

## Core Domains

### User

- `users`
- `user_tokens`
- `user_profiles`

Passwords must be stored as `password_hash`. Tokens should be stored as hashes, not raw tokens.

### Assessment

- `assessment_definitions`
- `assessment_questions`
- `assessment_options`
- `assessment_sessions`
- `assessment_answers`
- `mbti_dimensions`
- `mbti_personalities`

This keeps MBTI usable now while leaving room for other assessments later.

### Jobs

- `jobs`
- `job_tags`
- `job_tag_rel`
- `job_favorites`
- `job_targets`

The initialization script includes development seed jobs. The old `t_2025_multi_area_job_info` data can be imported later as an extended job corpus if needed.

### AI And Reports

- `agent_runs`
- `reports`
- `chat_sessions`
- `chat_messages`
- `resumes`
- `resume_analyses`
- `path_plans`
- `path_plan_milestones`
- `path_plan_tasks`

Backend persists structured outputs from `agent_server`; `agent_server` remains stateless for business storage.
`agent_runs` stores redacted audit snapshots for each backend-to-Agent proxy call, while user-facing saved results live in the domain tables.

## Script Order

Run:

```text
SQL脚本/00_init_career_decision_system.sql
SQL脚本/01_job_import_schema_upgrade.sql
SQL脚本/02_import_old_career_db_jobs.sql
SQL脚本/03_add_job_targets.sql  # only for databases created before target jobs existed
SQL脚本/04_add_refresh_tokens.sql  # only for databases created before refresh-token rotation existed
```

This creates the database, tables, indexes, foreign keys, comments, development seed data, and imports the 800 real job rows from the old SQL dump through a direct insert script.

Do not edit production SQL with replacement characters such as `U+FFFD`; run `scripts/verify-all.ps1` after SQL changes.

Do not migrate old users until old password hashes are confirmed safe.
