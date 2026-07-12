# Database Design

## Decision

Use a new MySQL database:

```text
career_decision_system
```

The SQL files `SQL脚本/career_db.sql` and `SQL脚本/career_decision_system.sql` are reference/test snapshots, not the migration source of truth. Production migrations and seed scripts are covered by the text-encoding scan in `scripts/verify-all.ps1`; both snapshots are excluded because source job text may contain legacy replacement characters.

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

`chat_sessions` groups one user's page-context conversation. `chat_messages` stores user/assistant content, stable request identifiers, optional Agent-run linkage, and the structured assistant response needed for idempotent retries. The `(user_id, request_id, role)` unique key prevents duplicate message sides without allowing one user to read another user's session.

### Decision And Action

- `career_directions`
- `personal_evidence`
- `decision_projects`
- `decision_candidates`
- `decision_project_job_samples`
- `decision_evidence`
- `comparison_criteria`
- `comparison_results`
- `decision_targets`
- `target_confidence_feedback`
- `task_results`
- `task_change_history`
- `weekly_reviews`

`decision_targets` is the source of truth for new confirmed targets. The primary target name is mirrored to `user_profiles.target_role` only for old API compatibility. `path_plans`, milestones, and tasks remain shared storage, with `plan_type='action'` distinguishing first-version plans from historical paths.

Task rows and user profiles carry integer versions for optimistic locking. `task_results`, weekly reviews, target-confidence feedback, generated plans, snapshots, and task histories use stable request identifiers where retries could otherwise duplicate writes. `weekly_reviews.request_id` was added in V6 and is unique per user.
Task status and result request IDs remain bound to their original task; cross-task reuse is rejected instead of being interpreted as a successful retry.

## Flyway Migrations

`backend/src/main/resources/db/migration` is the production schema source of truth:

```text
B1  legacy schema baseline
V2  career direction, decision project, action plan, evidence and review domain
V3  idempotent task results
V4  weekly-review proposal text compatibility
V5  richer profile/evidence fields and external AI consent
V6  idempotent weekly-review request identifiers
V7  persistent chat sessions and messages
```

Flyway uses `baseline-on-migrate=true` with baseline version 1 so an existing legacy database begins at V2 without replaying B1. Never edit an already-applied migration; add the next numbered migration. `backend/src/test/resources/schema.sql` is an independent H2 schema for tests and must be updated alongside new production migrations.

V7 is intentionally compatible with both a database that has no chat tables and the imported full snapshot's older chat-table shape. It creates missing tables or upgrades existing tables in place, backfills message ownership from the parent session, and aborts rather than guessing if a legacy message cannot be assigned to a user.

The scripts under `SQL脚本/` remain full snapshots and one-time import references for the 808-job corpus. They are not appended for normal schema evolution.

Do not edit production SQL with replacement characters such as `U+FFFD`; run `scripts/verify-all.ps1` after SQL changes.

Do not migrate old users until old password hashes are confirmed safe.
