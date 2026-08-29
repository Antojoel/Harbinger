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
- Real MCP adapter server (Vignesh, A6): `services/mcp-server/server.py` rewritten from a sleep-forever stub to a working `FastMCP` server (`mcp` SDK, pinned `>=1.9,<2`).
  - Three tools, each a thin proxy over the engine REST API: `check_shipment_risk` → `POST /api/simulate` (accepts `shipment_id`, `documents`, and optional `hs_code` / `country`), `record_outcome_tool` → `POST /api/record-outcome` (assembles `actual_outcome` from `was_held` / `reason_code` / `detail`), `query_patterns_tool` → `GET /api/patterns` (optional `hs_code` / `country` filters).
  - Shared `_engine_request()` helper that never raises: a non-2xx response or an unreachable engine comes back as `{"error", "detail"}` so a tool call is never silently dropped.
  - Transport selected by `MCP_TRANSPORT`: `stdio` (default, for a local Claude Desktop / Claude Code config) or `streamable-http` / `sse` (networked, for the Docker Compose service); `MCP_HOST` / `MCP_PORT` configurable.
  - `services/mcp-server/tests/` — 10 unit tests using `httpx.MockTransport` (payload assembly, filter passing, error handling, tool registration); lint and format clean.
  - Verified end to end with a real MCP client through the server to the engine to a seeded Neo4j: `check_shipment_risk` matched stored patterns `PAT-001` + `PAT-014` (risk 0.87) and `record_outcome_tool` reinforced `PAT-001` (frequency 14 → 15, confidence 0.82 → 0.83).
- `docker-compose.yml`: the `mcp-server` service now publishes port `9000` and runs the `streamable-http` transport so the MCP endpoint is reachable at `http://localhost:9000/mcp`; `services/mcp-server/Dockerfile` exposes `9000`.

### Fixed
- `main.py` imported a `graph.neo4j_client` module that didn't exist, which would have crashed the app on startup.
- `record_pattern()` (Vignesh) overwrote an existing pattern's stored `detail` with a generic fallback string on every reinforcement; the caller-supplied detail is now only written when provided, with a separate fallback used on node creation.
- `record-outcome` and `graph` endpoint responses didn't match the documented API contract (wrong field names, `source/target/label` instead of `from/to/type` on graph edges); `patterns` returned a bare array instead of `{"patterns": [...]}`. All aligned to the contract and verified against a running instance.
- Reconciled a git divergence: Vignesh's real graph layer (V1-V4) was built against the placeholder `neo4j_client.py` interface from before A4 existed, and diverged from what `engine.py` actually called (different method names/signatures, `Pattern`/`GraphSnapshot` dataclasses vs. the dicts A4 expected). Merged `origin/main` and rewrote `engine.py`'s `simulate()`/`record_outcome()`/`query_patterns()`/`graph_snapshot()` to call the real interface correctly, and removed A4's local contradiction-detection logic since `graph_client.find_matching_patterns()` already applies `graph.rules` internally — that was becoming a second, divergent implementation of the same business rules.
- `SimulateRequest` in `routes.py` never declared a `country` field; Pydantic was silently dropping it before it reached the engine, so certificate-requirement lookups could never resolve a destination country. Added the field.
- Verified the full pipeline against a real, seeded Neo4j instance (not just degraded/stub mode): `/simulate` correctly matches real stored patterns, and `/record-outcome` genuinely reinforces them (`PAT-001` frequency 14→15, confidence 0.82→0.83 after one recorded outcome).
