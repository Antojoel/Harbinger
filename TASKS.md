# TASKS.md

Pick a workstream, claim it by putting your name next to it, check items
off as you go. Docker Compose brings up all services together — run
`docker-compose up` from the repo root to start.

## Backend A — Graph + Core Engine (services/engine/app/core, .../graph, .../seed)
Owner: _____
- [ ] Design the Neo4j schema: nodes (HSCode, Country, CertificateRequirement,
      DocumentType, RejectionReason, Shipment, Pattern) and edges (REQUIRES,
      CONTRADICTS, CAUSED_REJECTION, MATCHES, RESOLVED_BY)
- [ ] Write seed_data.py: load an initial rule set covering 3 distinct
      contradiction types (unit mismatch, HS code mismatch, missing
      certificate) across a few shipments
- [ ] Implement `simulate(shipment_docs) -> {risk_score, reasons, matched_patterns}`
- [ ] Implement `record_outcome(shipment_id, actual_outcome)` — must create/
      reinforce a Pattern node+edges in the graph (this is the "immune
      memory grows" mechanic — the whole point of the demo)
- [ ] Implement `query_patterns(filters)` and `graph_snapshot()` (returns
      nodes+edges as JSON for the frontend visualization)

## Backend B — REST + MCP Adapters (services/engine/app/api, services/mcp-server)
Owner: _____
- [ ] Build REST routes: POST /simulate, POST /record-outcome, GET /graph,
      GET /patterns — thin wrappers calling Backend A's core functions
- [ ] Build the MCP server: 3 tools (check_shipment_risk, record_outcome_tool,
      query_patterns_tool), each calling the REST API via HTTP internally
- [ ] Do REST first — it's the primary demo path. MCP is a secondary
      cutaway, get to it after REST works end to end

## Backend C — Vertex AI + Razorpay (new: services/engine/app/integrations/)
Owner: _____
- [ ] Get Vertex AI speech-to-text + text-to-speech round-tripping on one
      test phrase
- [ ] Wire voice input -> calls /simulate -> speaks back the risk/reasons
- [ ] Razorpay integration: checkout flow + webhook confirming payment
      (pricing model TBD — build the integration generically so it works
      whether we land on usage-based or subscription pricing)

## Frontend/App — React + Tailwind (apps/web)
Owner: _____
- [ ] ShipmentUpload: upload 4 document types, call /simulate
- [ ] RiskChecklist: show risk score + reasons + drafted-fix approval flow
- [ ] GraphVisualization: render nodes/edges from GET /api/graph, and make
      sure it visibly updates after a record-outcome call — this live
      "memory growing" moment is a core part of the demo
- [ ] VoiceWidget: mic button, calls the voice-enabled endpoint, shows
      transcript + spoken response
- [ ] PricingCheckout: pricing screen with ROI math + Razorpay checkout button
