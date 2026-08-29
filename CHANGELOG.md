# Changelog

All notable changes to this project are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Initial monorepo scaffold: Python/FastAPI core engine, MCP adapter server, React + Tailwind web app, and Neo4j graph database, orchestrated with Docker Compose.
- REST API skeleton (`POST /api/simulate`, `POST /api/record-outcome`, `GET /api/graph`, `GET /api/patterns`) for the Predictive Preemption + Immune Memory engine.
- MCP server skeleton exposing `check_shipment_risk`, `record_outcome_tool`, and `query_patterns_tool`, proxying to the engine's REST API over HTTP.
- Web app scaffold with live immune-memory graph visualization (`vis-network`), shipment document upload, and risk checklist components.
- `TASKS.md` team task board with workstreams for the graph/core engine, REST + MCP adapters, Vertex AI + Razorpay integrations, and the frontend.
- Project README with architecture diagram, tech stack, API reference, and quickstart instructions.
- `TASKS.md` full API contract (exact request/response JSON for all 6 endpoints), a task-level dependency graph, and detailed per-person tasks so each teammate's coding agent can work independently.
- `POST /api/voice-query`, `POST /api/create-payment-order`, and `POST /api/verify-payment` stub endpoints — completing the contract for Harish's voice widget and pricing/checkout work.
- Placeholder `services/engine/app/graph/neo4j_client.py` so the FastAPI app boots without a running Neo4j instance while Vignesh builds the real graph layer.
- Python entries in `.gitignore` (`__pycache__/`, `*.pyc`, `.venv/`, `venv/`).

### Fixed
- `main.py` imported a `graph.neo4j_client` module that didn't exist, which would have crashed the app on startup.
- `record-outcome` and `graph` endpoint responses didn't match the documented API contract (wrong field names, `source/target/label` instead of `from/to/type` on graph edges); `patterns` returned a bare array instead of `{"patterns": [...]}`. All aligned to the contract and verified against a running instance.
