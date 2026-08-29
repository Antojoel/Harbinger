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
- Immune-memory graph layer (Vignesh, V1–V4): real Neo4j client, schema, seed data, and Cypher query functions.
  - `services/engine/app/graph/neo4j_client.py` — `GraphClient` with connection pooling and `verify_connectivity`, managed read/write transactions, and a degraded mode (reads return empty, writes are logged and skipped) that keeps the stub API serving when Neo4j is down. Domain calls `find_matching_patterns()`, `record_pattern()`, `list_patterns()`, and `graph_snapshot()` are exposed both as `graph_client` methods and as module-level functions for the core engine to import.
  - `services/engine/app/graph/schema.py` — single source of truth for the graph: 7 node labels with key properties, 7 uniqueness constraints, the canonical edges from `TASKS.md` V2 plus `DECLARES_HS` / `DESTINED_FOR` structural edges, the snapshot node-id scheme, and the `frequency / (frequency + 3)` confidence formula.
  - `services/engine/app/graph/rules.py` — pure, dependency-free document-contradiction detectors (unit mismatch, missing certificate, deprecated HS code, HS-code mismatch); the graph supplies the rules, these apply them to a shipment's documents.
  - `services/engine/app/graph/models.py` — `Pattern` and `GraphSnapshot` dataclasses whose `to_dict()` matches the `TASKS.md` API contract.
  - `services/engine/app/seed/seed_data.py` — rewritten to load the constraints plus a demo dataset covering all three contradiction types (unit mismatch, deprecated HS code `8504.40` → `8504.41`, missing Certificate of Origin) across four shipments, with seeded patterns `PAT-001` / `PAT-002` / `PAT-014`. Idempotent; `python -m seed.seed_data [--keep]`.
  - `services/engine/tests/` — 40 unit tests (no database) and 7 integration tests (auto-skipped when Neo4j is unreachable), verified against a Neo4j 5 instance at 94% coverage of the graph and seed packages.
  - `requirements-dev.txt` and `pytest.ini` for the engine service.
- Structured logging in the engine: `logging.basicConfig` in `main.py` and startup/shutdown log lines, so the graph layer's connection and degraded-mode messages surface under uvicorn.
- Test and tooling entries in `.gitignore` (`.pytest_cache/`, `.coverage`, `htmlcov/`, `.ruff_cache/`).

### Fixed
- `main.py` imported a `graph.neo4j_client` module that didn't exist, which would have crashed the app on startup.
- `record_pattern()` (Vignesh) overwrote an existing pattern's stored `detail` with a generic fallback string on every reinforcement; the caller-supplied detail is now only written when provided, with a separate fallback used on node creation.
- `record-outcome` and `graph` endpoint responses didn't match the documented API contract (wrong field names, `source/target/label` instead of `from/to/type` on graph edges); `patterns` returned a bare array instead of `{"patterns": [...]}`. All aligned to the contract and verified against a running instance.
