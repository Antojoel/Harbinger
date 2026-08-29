"""
Harbinger MCP Adapter Server
============================
Exposes the Harbinger engine as Model Context Protocol tools so an AI agent
client (Claude, etc.) can predict customs holds and grow the immune-memory
graph directly.

Each tool is a thin proxy over the engine's REST API (``services/engine``):

    check_shipment_risk   -> POST /api/simulate
    record_outcome_tool   -> POST /api/record-outcome
    query_patterns_tool   -> GET  /api/patterns

Transport is selected by ``MCP_TRANSPORT`` (``stdio`` for a local Claude
Desktop / Claude Code config, ``streamable-http`` / ``sse`` for a networked
service — see docker-compose). No engine logic lives here; this is adapter
code only.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

logger = logging.getLogger("harbinger.mcp")

ENGINE_URL = os.getenv("ENGINE_URL", "http://engine:8000").rstrip("/")
ENGINE_TIMEOUT = float(os.getenv("MCP_ENGINE_TIMEOUT", "15"))
MCP_TRANSPORT = os.getenv("MCP_TRANSPORT", "stdio")

mcp = FastMCP(
    "harbinger",
    host=os.getenv("MCP_HOST", "0.0.0.0"),
    port=int(os.getenv("MCP_PORT", "9000")),
)


def _make_client() -> httpx.AsyncClient:
    """HTTP client for engine calls. Separated so tests can inject a transport."""
    return httpx.AsyncClient(timeout=ENGINE_TIMEOUT)


async def _engine_request(
    method: str,
    path: str,
    *,
    json: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Call the engine REST API and return its JSON.

    Never raises: a transport failure or non-2xx response comes back as
    ``{"error": ..., "detail": ...}`` so the calling agent gets a usable
    answer instead of a dropped tool call.
    """
    url = f"{ENGINE_URL}{path}"
    logger.info("engine %s %s", method, path)
    try:
        async with _make_client() as client:
            response = await client.request(method, url, json=json, params=params)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        logger.error("engine %s %s -> HTTP %s", method, path, exc.response.status_code)
        return {
            "error": f"engine returned HTTP {exc.response.status_code}",
            "detail": exc.response.text[:500],
        }
    except httpx.HTTPError as exc:
        logger.error("engine %s %s unreachable: %s", method, path, exc)
        return {"error": "engine_unreachable", "detail": str(exc)}
    except ValueError as exc:  # non-JSON body
        logger.error("engine %s %s returned non-JSON: %s", method, path, exc)
        return {"error": "engine_bad_response", "detail": str(exc)}


@mcp.tool()
async def check_shipment_risk(
    shipment_id: str,
    documents: dict[str, Any] | None = None,
    hs_code: str | None = None,
    country: str | None = None,
) -> dict[str, Any]:
    """Predict the customs hold risk for a shipment's draft documents.

    Args:
        shipment_id: Container / shipment tracking number, e.g. "MSKU1234567".
        documents: The trade document payload — commercial_invoice, packing_list,
            bill_of_lading, certificate_of_origin. Units and hs_code go inside
            commercial_invoice.
        hs_code: Declared HS code. Optional; falls back to
            documents.commercial_invoice.hs_code.
        country: Destination country code, e.g. "DE". Needed for
            certificate-requirement checks.

    Returns:
        {"shipment_id", "risk_score" (0-1), "reasons": [{"code", "detail"}],
         "matched_patterns": [pattern_id, ...]}
    """
    payload: dict[str, Any] = {"shipment_id": shipment_id, "documents": documents or {}}
    if hs_code:
        payload["hs_code"] = hs_code
    if country:
        payload["country"] = country
    return await _engine_request("POST", "/api/simulate", json=payload)


@mcp.tool()
async def record_outcome_tool(
    shipment_id: str,
    was_held: bool,
    reason_code: str | None = None,
    detail: str | None = None,
) -> dict[str, Any]:
    """Record a shipment's real customs outcome so the graph learns from it.

    When ``was_held`` is true and a ``reason_code`` is supplied, the
    immune-memory graph reinforces (or creates) that failure pattern, so
    future simulations catch it faster.

    Args:
        shipment_id: The shipment the outcome belongs to.
        was_held: True if customs actually held the shipment.
        reason_code: Failure reason, e.g. "MISSING_CERTIFICATE",
            "UNIT_MISMATCH", "HS_CODE_DEPRECATED".
        detail: Optional human-readable note stored on the pattern.

    Returns:
        {"status": "recorded", "pattern_updated": bool,
         "new_nodes": [...], "new_edges": [...]}
    """
    actual_outcome: dict[str, Any] = {"was_held": was_held}
    if reason_code:
        actual_outcome["reason_code"] = reason_code
    if detail:
        actual_outcome["detail"] = detail
    return await _engine_request(
        "POST",
        "/api/record-outcome",
        json={"shipment_id": shipment_id, "actual_outcome": actual_outcome},
    )


@mcp.tool()
async def query_patterns_tool(
    hs_code: str | None = None,
    country: str | None = None,
) -> dict[str, Any]:
    """List the customs-rejection patterns the graph has learned.

    Args:
        hs_code: Filter to patterns seen on shipments declaring this HS code.
        country: Filter to patterns seen on shipments to this destination.

    Returns:
        {"patterns": [{"pattern_id", "type", "frequency", "confidence", ...}]}
    """
    params: dict[str, Any] = {}
    if hs_code:
        params["hs_code"] = hs_code
    if country:
        params["country"] = country
    return await _engine_request("GET", "/api/patterns", params=params or None)


def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )
    logger.info(
        "Harbinger MCP server starting (engine=%s, transport=%s)",
        ENGINE_URL,
        MCP_TRANSPORT,
    )
    mcp.run(transport=MCP_TRANSPORT)


if __name__ == "__main__":
    main()
