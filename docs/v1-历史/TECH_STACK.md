# Technical Stack

## Architecture

```text
web / android
  -> backend
    -> agent_server
      -> LLM / RAG / external tools
```

The frontend clients never call `agent_server` directly. All user-facing requests go through `backend` for authentication, authorization, persistence, audit logging, and rate control.

## Web

- Vue 3
- TypeScript
- Vite
- Pinia
- Vue Router
- Element Plus or a local component layer over Element Plus
- ECharts for reports and skill charts
- Axios for HTTP

Visual direction:

- Primary color: `#39C5BB`
- No purple, pink-purple, blue-purple gradients, or purple glow effects
- High-concentration virtual singer / anime-inspired AI mentor style
- Professional tool readability remains mandatory

## Android

- Kotlin
- Jetpack Compose
- MVVM
- Retrofit
- Kotlin Coroutines
- Hilt
- DataStore
- Room for optional offline cache
- Navigation Compose

Android focuses on high-frequency lightweight flows: dashboard, AI chat, daily tasks, reports, check-ins, and profile.

## Backend

- Java 21
- Spring Boot 3.x
- Spring Web
- Spring Validation
- Spring Security later in the milestone
- MyBatis or MyBatis Plus
- MySQL 8
- Redis later for sessions, cache, rate limits, and AI task state
- Maven

Backend owns business data and calls `agent_server` as an internal service.

## Agent Server

- Python 3.12 or 3.13 recommended
- FastAPI
- Uvicorn
- Pydantic / Pydantic Settings
- LangGraph for controlled agent workflows
- HTTPX for internal backend/model calls
- pytest for tests
- Ruff for linting

Python development must use a virtual environment:

```powershell
cd D:\Project\career-decision-system\agent_server
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install -r requirements.txt
```

If Python 3.12 is not installed locally, install it later and recreate `.venv`. Do not commit `.venv` or `.env`.
