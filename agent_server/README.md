# Agent Server

FastAPI service for AI workflows.

## Local Setup

```powershell
cd D:\Project\career-decision-system\agent_server
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

This workspace currently has Python 3.14 available, so the local `.venv` may be created with 3.14 until Python 3.12/3.13 is installed.

## Scope

The server owns prompt orchestration, LangGraph workflows, LLM adapter logic, and structured AI output validation. It should not own user account data or write the main business database directly.

## Internal Auth

Health, readiness, and local docs are public. Business endpoints require the backend to send:

```http
X-Internal-Token: <INTERNAL_API_TOKEN>
```

Keep `INTERNAL_API_TOKEN` aligned with `career.agent-server.internal-token` in the Spring Boot backend configuration.

## LLM Provider

Default local behavior is deterministic:

```text
LLM_PROVIDER=mock
```

Career reports, profiles, resumes, path planning, chat, decision coaching, job comparison, action coaching, and weekly review can use any OpenAI-compatible `/chat/completions` provider. Start from `.env.openai-compatible.example`; leave the real key only in `.env` or process environment variables.

```powershell
@'
LLM_PROVIDER=openai_compatible
LLM_MODEL=your-model-name
LLM_BASE_URL=https://your-provider.example/v1
LLM_API_KEY=your-api-key
'@ | Set-Content .env -Encoding UTF8
```

Every graph keeps a deterministic baseline and only replaces it when the provider returns valid structured JSON.

The root `start-dev.bat` launcher respects this `.env` file and does not force `LLM_PROVIDER=mock`. Restart Agent after changing the file, then use `start-dev.bat status` to inspect the active provider. Run `scripts/smoke-api.ps1 -RequireRealModel` for one consented provider call followed by a consent-revoked fallback check.

Provider configuration alone does not authorize a real call. Business request schemas default `allow_external_model=false`; the backend sets it only after reading the logged-in user's `externalAiConsent`. Without both provider configuration and per-user consent, the graph returns its deterministic baseline. See `docs/PRIVACY_AND_AI_CONSENT.md`.

## Fixed Evaluations

`evals/coaching_cases.json` contains 32 deterministic coaching cases covering decision, comparison, action, and weekly-review workflows. They check relevance, evidence and uncertainty fields, JSON contracts, duplicate suggestions, and prompt-injection boundaries.

```powershell
python -m pytest tests/test_fixed_coaching_evals.py -q
```
