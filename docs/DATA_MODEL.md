# Data Model

This document records the first backend business entities. The current implementation uses MySQL with MyBatis.

## User

Target table: `users`

| Field | Type | Notes |
|---|---|---|
| id | bigint | Primary key |
| username | varchar | Unique login name |
| email | varchar | Optional, unique later |
| phone | varchar | Optional, unique later |
| password_hash | varchar | BCrypt/Argon2 hash only |
| created_at | datetime | Creation time |
| updated_at | datetime | Update time |

## User Token

Target table: `user_tokens`

| Field | Type | Notes |
|---|---|---|
| id | bigint | Primary key |
| user_id | bigint | User id |
| token_hash | char(64) | SHA-256 hash of the random bearer token |
| token_prefix | varchar | Short prefix for diagnostics only |
| token_type | varchar | `access` or `refresh` |
| expires_at | datetime | Expiration |
| revoked_at | datetime | Logout/revocation time |
| created_at | datetime | Creation time |

Tokens are server-side persisted as hashes only. `POST /auth/refresh` revokes the presented refresh token and issues a new access/refresh pair. `POST /auth/logout` revokes the current access token and all active refresh tokens for the user by setting `revoked_at`. Existing databases created before refresh-token support should run `SQL脚本/04_add_refresh_tokens.sql`.

## MBTI Question

Target tables:

- `mbti_questions`
- `mbti_options`
- `mbti_answers`
- `mbti_results`

Question shape:

| Field | Type | Notes |
|---|---|---|
| id | int | Question id |
| text | varchar | Question text |
| options | array | Two or more options |

Option shape:

| Field | Type | Notes |
|---|---|---|
| code | varchar | `A`, `B`, etc. |
| dimension | varchar | `EI`, `SN`, `TF`, `JP` |
| direction | varchar | `E`, `I`, `S`, `N`, `T`, `F`, `J`, `P` |

## Job

Target tables:

- `jobs`
- `job_tags`
- `job_favorites`
- `job_targets`

Current storage uses imported real job records from the MySQL `jobs` table and related tag tables.

| Field | Type | Notes |
|---|---|---|
| id | bigint | Job id |
| title | varchar | Job title |
| company | varchar | Display company |
| location | varchar | City or remote |
| direction | varchar | Career direction |
| salary_range | varchar | Display salary range |
| experience_level | varchar | Experience requirement |
| education | varchar | Education requirement |
| summary | text | Short role summary |
| responsibilities | json/text | Responsibility bullets |
| requirements | json/text | Requirement bullets |
| growth_path | json/text | Suggested growth path |
| interview_focus | json/text | Interview preparation tags |

`job_favorites` stores a user's shortlist. `job_targets` stores the smaller set of roles the user has selected as active career targets, so reports and path plans can later default to explicit goals instead of inferring from search history.

## Report Archive

Target table: `reports`

Reports are persisted in MySQL and scoped by authenticated user. Clients do not send `userId` for archive ownership.

| Field | Type | Notes |
|---|---|---|
| id | bigint | Archive id |
| user_id | bigint | Owner from bearer token |
| agent_run_id | bigint | Optional linked `agent_runs.id` |
| type | varchar | `career_report`, `resume_analysis`, `path_plan`, etc. |
| title | varchar | Display title |
| summary | text | Short summary |
| content | json/text | Structured report payload |
| created_at | datetime | Creation time |
| updated_at | datetime | Update time |

## Path Plan Task

Target table: `path_plan_tasks`

| Field | Type | Notes |
|---|---|---|
| id | bigint | Task id |
| milestone_id | bigint | Parent milestone |
| content | varchar | Task text |
| status | varchar | `todo` or `done` |
| due_date | date | Optional due date |
| completed_at | datetime | Backend-set completion time |
| sort_order | int | Display order |

Path plan records and resume analysis records may link to `agent_runs.id` through `agent_run_id`. Path plan API responses calculate `taskCount`, `completedTaskCount`, and `progressPercent` from persisted task rows. These are response fields, not separate database columns.

## Resume Analysis Archive

Target tables:

- `resumes`
- `resume_analyses`

The archive flow stores `resumes.content_hash` as a SHA-256 hash of the submitted resume text and leaves `resumes.resume_text` null. `resume_analyses` stores scores, issues, suggestions, generated improved fragments, ownership, and the optional `agent_run_id`. Raw resume persistence should stay out of this flow unless a future encrypted or object-storage design is added.

## Agent Run Audit

Target table: `agent_runs`

Backend creates one audit row for each backend-to-Agent proxy call. The row is for diagnostics and observability, not for rendering the user's saved archive records.

| Field | Type | Notes |
|---|---|---|
| id | bigint | Audit id |
| request_id | varchar | Trace/request id, unique |
| user_id | bigint | Parsed numeric user id when available |
| agent_type | varchar | `career_report`, `profile`, `chat`, `resume`, `path_plan` |
| model_name | varchar | Optional model/provider name returned by Agent output metadata |
| status | varchar | `success` or `failed` |
| input_json | json/text | Redacted request snapshot |
| output_json | json/text | Redacted successful output snapshot |
| error_message | text | Failure summary |
| latency_ms | int | Backend-to-Agent call duration |
| started_at | datetime | Start time |
| finished_at | datetime | End time |

Sensitive fields such as `resume_text`, `message`, tokens, phone numbers, emails, authorization values, and `improved_fragments` are replaced with `[redacted]` before persistence in audit JSON and failure messages. User-facing generated results are still persisted in domain tables such as `reports`, `resume_analyses`, and `path_plans`; those tables store `agent_run_id` when clients archive a generated result that includes `agentRunId`.
