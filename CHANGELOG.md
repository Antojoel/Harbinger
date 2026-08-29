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
