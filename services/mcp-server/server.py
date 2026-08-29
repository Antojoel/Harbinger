"""
Harbinger MCP Adapter Server
============================
Exposes MCP tools (check_shipment_risk, record_outcome_tool, query_patterns_tool)
which proxy requests via HTTP to the engine REST API service.

Backend B Owner: Implement MCP protocol tool handlers using httpx or requests to call engine:8000.
"""

import os
import sys
import asyncio
import logging
import httpx
from typing import Dict, Any, Optional

logger = logging.getLogger("mcp-server")
logging.basicConfig(level=logging.INFO)

ENGINE_URL = os.getenv("ENGINE_URL", "http://engine:8000")


# --- MCP Tool Stubs ---

async def check_shipment_risk(shipment_id: str, documents: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    MCP Tool: check_shipment_risk
    Calls the engine's POST /api/simulate endpoint via HTTP.
    """
    url = f"{ENGINE_URL}/api/simulate"
    payload = {
        "shipment_id": shipment_id,
        "documents": documents or {}
    }
    logger.info(f"MCP Tool 'check_shipment_risk' calling {url} for shipment {shipment_id}")
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=10.0)
            return resp.json()
    except Exception as e:
        logger.warning(f"Engine HTTP call failed ({e}), returning stub response")
        return {
            "shipment_id": shipment_id,
            "risk_score": 0.75,
            "reasons": ["HTTP engine connection pending, stub fallback response"],
            "mcp_status": "stub_fallback"
        }


async def record_outcome_tool(shipment_id: str, actual_outcome: Dict[str, Any]) -> Dict[str, Any]:
    """
    MCP Tool: record_outcome_tool
    Calls the engine's POST /api/record-outcome endpoint via HTTP.
    """
    url = f"{ENGINE_URL}/api/record-outcome"
    payload = {
        "shipment_id": shipment_id,
        "actual_outcome": actual_outcome
    }
    logger.info(f"MCP Tool 'record_outcome_tool' calling {url} for shipment {shipment_id}")
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=10.0)
            return resp.json()
    except Exception as e:
        logger.warning(f"Engine HTTP call failed ({e}), returning stub response")
        return {
            "shipment_id": shipment_id,
            "status": "outcome_recorded_stub",
            "mcp_status": "stub_fallback"
        }


async def query_patterns_tool(hs_code: Optional[str] = None, country: Optional[str] = None) -> Dict[str, Any]:
    """
    MCP Tool: query_patterns_tool
    Calls the engine's GET /api/patterns endpoint via HTTP.
    """
    url = f"{ENGINE_URL}/api/patterns"
    params = {}
    if hs_code:
        params["hs_code"] = hs_code
    if country:
        params["country"] = country

    logger.info(f"MCP Tool 'query_patterns_tool' calling {url}")
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, timeout=10.0)
            return resp.json()
    except Exception as e:
        logger.warning(f"Engine HTTP call failed ({e}), returning stub response")
        return {
            "patterns": [
                {"pattern_id": "PAT-001", "type": "unit_mismatch", "frequency": 14}
            ],
            "mcp_status": "stub_fallback"
        }


async def main():
    logger.info(f"Starting Harbinger MCP Adapter Server (Engine Target: {ENGINE_URL})...")
    # TODO (Backend B): Initialize official mcp.server / FastMCP instance exposing the 3 tools
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
