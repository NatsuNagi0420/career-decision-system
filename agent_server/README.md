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

Career report generation, capability profile, resume analysis, path planning, and chat can use any OpenAI-compatible `/chat/completions` provider:

```powershell
@'
LLM_PROVIDER=openai_compatible
LLM_MODEL=your-model-name
LLM_BASE_URL=https://your-provider.example/v1
LLM_API_KEY=your-api-key
'@ | Set-Content .env -Encoding UTF8
```

The career report, capability profile, resume analysis, path planning, and chat graphs keep deterministic baselines and only replace them when the provider returns valid structured JSON.
