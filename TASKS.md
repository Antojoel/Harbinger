# TASKS.md

Team: 3 devs — Anto (Lead + Backend), Vignesh (Backend), Harish (Frontend).
Check items off as you go. Docker Compose brings up all services together —
run `docker-compose up` from the repo root to start.

---

## Anto — Lead + Backend: Core Engine, REST + MCP Adapters, Integrations
*(services/engine/app/core, services/engine/app/api, services/mcp-server, services/engine/app/integrations)*

**Coordination (Lead responsibilities, on top of the build tasks below):**
- [ ] Unblock Vignesh and Harish when they're stuck on an interface/contract question
- [ ] Own the integration points between all workstreams (core engine ↔ graph ↔ frontend) — merge and resolve conflicts
- [ ] Own final submission: GitHub repo cleanliness, README/build instructions accuracy, demo video/live URL
- [ ] Own demo rehearsal — run the full 90–105 sec script end-to-end multiple times before judging

**Core engine:**
- [ ] Implement `simulate(shipment_docs) -> {risk_score, reasons, matched_patterns}`,
      querying Vignesh's graph
- [ ] Implement `record_outcome(shipment_id, actual_outcome)` — must create/
      reinforce a Pattern node+edges in the graph (this is the "immune
      memory grows" mechanic — the whole point of the demo)
- [ ] Implement `query_patterns(filters)` and `graph_snapshot()` (returns
      nodes+edges as JSON for the frontend visualization)

**REST + MCP adapters:**
- [ ] Build REST routes: POST /simulate, POST /record-outcome, GET /graph,
      GET /patterns — thin wrappers over the core engine functions above
- [ ] Build the MCP server: 3 tools (check_shipment_risk, record_outcome_tool,
      query_patterns_tool), each calling the REST API via HTTP internally
- [ ] Do REST first — it's the primary demo path. MCP is a secondary
      cutaway, get to it after REST works end to end

**Vertex AI + Razorpay:**
- [ ] Get Vertex AI speech-to-text + text-to-speech round-tripping on one
      test phrase
- [ ] Wire voice input -> calls /simulate -> speaks back the risk/reasons
- [ ] Razorpay integration: checkout flow + webhook confirming payment
      (pricing model TBD — build the integration generically so it works
      whether we land on usage-based or subscription pricing)

*Sequencing if time runs short: core engine → REST → MCP → Vertex AI → Razorpay,
so there's always a working demo path even if the later items don't get finished.*

---

## Vignesh — Backend: Immune Memory Graph
*(services/engine/app/graph, services/engine/app/seed)*

- [ ] Design the Neo4j schema: nodes (HSCode, Country, CertificateRequirement,
      DocumentType, RejectionReason, Shipment, Pattern) and edges (REQUIRES,
      CONTRADICTS, CAUSED_REJECTION, MATCHES, RESOLVED_BY)
- [ ] Write seed_data.py: load an initial rule set covering 3 distinct
      contradiction types (unit mismatch, HS code mismatch, missing
      certificate) across a few shipments
- [ ] Build neo4j_client.py: connection handling + the Cypher query functions
      Anto's core engine will call into (e.g. find matching patterns for a
      shipment, write/reinforce a pattern node+edges on a recorded outcome)
- [ ] Coordinate directly with Anto on the exact query function signatures
      he needs from the core engine — this is the one hard interface
      between your two workstreams, agree on it early

---

## Harish — Frontend: React + Tailwind
*(apps/web)*

- [ ] ShipmentUpload: upload 4 document types, call /simulate
- [ ] RiskChecklist: show risk score + reasons + drafted-fix approval flow
- [ ] GraphVisualization: render nodes/edges from GET /api/graph, and make
      sure it visibly updates after a record-outcome call — this live
      "memory growing" moment is a core part of the demo
- [ ] VoiceWidget: mic button, calls the voice-enabled endpoint, shows
      transcript + spoken response
- [ ] PricingCheckout: pricing screen with ROI math + Razorpay checkout button
