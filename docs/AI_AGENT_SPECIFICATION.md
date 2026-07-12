# AI Agent Specification

## Principle

Use controlled LangGraph workflows before autonomous multi-agent behavior.

The first milestone keeps deterministic graph nodes as safe fallbacks. `app/services/llm_client.py` supports mock and OpenAI-compatible HTTP providers, and graph nodes progressively adopt it where generation quality matters. Real enhancement requires both a configured provider and `allow_external_model=true`, which the backend derives from the logged-in user's explicit authorization. When an LLM enhancement is disabled or fails, the workflow returns the deterministic fallback and logs only workflow name, trace ID, and error type.

## Workflows

### Career Report

```text
normalize_profile
  -> recommend_careers from backend job_candidates when present
  -> analyze_skill_gap
  -> compose_report
  -> enhance_report_with_llm when provider is not mock
```

`job_candidates` are prepared by the Spring Boot backend from the real `jobs` table. The agent should treat them as grounded evidence and prefer them over template-only recommendations.

The career report workflow first builds a deterministic baseline response, then asks the configured LLM provider for a JSON-only refinement. If the provider fails or returns an invalid shape, the baseline response is returned.

### Capability Profile

```text
create_baseline_profile
  -> enhance_profile_with_llm when provider is not mock
  -> validate scores, tags, radar points, strengths, and suggestions
```

The capability profile workflow keeps deterministic completeness, star, tag, and radar baselines. LLM output is normalized to `completeness_score` 0-100, `competitiveness_stars` 1-5, and radar values 0-100; empty lists fall back to the baseline.

### Chat

```text
create_baseline_chat
  -> enhance_chat_with_llm when provider is not mock
  -> validate intent and navigation action whitelist
```

The chat workflow supports Chinese and English intent hints in the deterministic baseline. LLM output is limited to structured JSON and normalized to the allowed intents and navigation actions so Web and Android do not receive arbitrary routes.

### Resume

```text
build baseline resume analysis
  -> enhance_resume_with_llm when provider is not mock
  -> validate structured scores, issues, suggestions, and fragments
```

The resume workflow keeps a deterministic baseline response, then asks the configured LLM provider for JSON-only refinement. The agent trims long resume text before sending it to the provider and falls back to the baseline if the provider fails or returns invalid JSON.

### Path Plan

```text
create_baseline_plan
  -> enhance_path_plan_with_llm when provider is not mock
  -> validate structured milestones, tasks, acceptance criteria, and checkpoints
```

The path plan workflow keeps a deterministic 12-week baseline, then asks the configured LLM provider for JSON-only refinement. Empty strings, empty task lists, and empty checkpoint lists are normalized away; if the provider fails or returns invalid JSON, the baseline plan is returned.

### Decision And Action Coaching

```text
build evidence-grounded fallback
  -> optionally enhance with the consented provider
  -> validate conclusion, evidence, counterarguments, uncertainty and next actions
  -> return generationMode=llm|fallback
```

Decision coaching, job comparison, action coaching, and weekly-review coaching never write business data. Suggested candidates, comparisons, tasks, or batch adjustments remain drafts until the user confirms them through backend mutation APIs.

## Output Rules

- Every endpoint must return structured data.
- Every response must include `trace_id`; business endpoints should echo request `request_id` as `trace_id`.
- Validation and unhandled errors must use the same response envelope as successful responses.
- Do not return raw markdown when backend needs to persist a report.
- Numeric scores must be clamped to their documented ranges before returning.
- Include risk notes and confidence for recommendation outputs.
- Avoid logging raw private resume content.
- LLM fallback logs must never include prompts, raw resumes, chat messages, tokens, or provider secrets.
- Request schemas must keep `allow_external_model=false` as the default; provider configuration alone is not consent.
- Chat actions must stay within `go:resume`, `go:path-planning`, `go:career-report`, `go:jobs`, and `go:profile`.

## Model Provider Plan

The default provider is `mock`. Use an OpenAI-compatible provider by setting these environment variables in `agent_server/.env`:

```text
LLM_PROVIDER=openai_compatible
LLM_MODEL=your-model-name
LLM_BASE_URL=https://your-provider.example/v1
LLM_API_KEY=your-api-key
LLM_TIMEOUT_SECONDS=30
LLM_MAX_RETRIES=2
LLM_RETRY_BACKOFF_SECONDS=0.2
```

Supported compatible provider names:

- OpenAI-compatible API through `/chat/completions`
- DeepSeek-compatible API
- Qwen/DashScope compatible mode
- Local model gateway

The rest of the application should not depend on a specific provider SDK.

The HTTP client retries retryable provider failures only: HTTP 429, HTTP 5xx, timeouts, and transport errors. HTTP 4xx request errors are returned without retry. Retry count and exponential backoff are configured with `LLM_MAX_RETRIES` and `LLM_RETRY_BACKOFF_SECONDS`.
