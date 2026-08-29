"""
FastAPI REST API Routes for Harbinger Engine
============================================
Defines REST endpoints for simulation, outcome recording, pattern querying,
and graph visualization.

Backend B Owner: Wire these endpoints to Backend A's core functions and add Pydantic validations.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional

from core import engine

router = APIRouter()


class SimulateRequest(BaseModel):
    shipment_id: Optional[str] = Field("MSKU1234567", description="Container or shipment tracking number")
    documents: Dict[str, Any] = Field(default_factory=dict, description="Uploaded trade document payload")


class RecordOutcomeRequest(BaseModel):
    shipment_id: str = Field(..., description="Shipment tracking number")
    actual_outcome: Dict[str, Any] = Field(..., description="Customs outcome details (passed, hold, fee_amount)")


@router.post("/simulate", summary="Simulate customs clearance and detect risk")
async def simulate_endpoint(payload: SimulateRequest):
    """
    POST /simulate: Simulates customs clearance risk for uploaded documents.
    """
    try:
        result = engine.simulate(payload.dict())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/record-outcome", summary="Record actual clearance outcome to update graph memory")
async def record_outcome_endpoint(payload: RecordOutcomeRequest):
    """
    POST /record-outcome: Records actual clearance result to reinforce pattern nodes in Neo4j.
    """
    try:
        result = engine.record_outcome(payload.shipment_id, payload.actual_outcome)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph", summary="Fetch graph nodes and edges for visualization")
async def graph_snapshot_endpoint():
    """
    GET /graph: Returns current Neo4j nodes and edges for the interactive frontend visualization.
    """
    try:
        return engine.graph_snapshot()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patterns", summary="Query historical risk patterns")
async def query_patterns_endpoint(hs_code: Optional[str] = Query(None), country: Optional[str] = Query(None)):
    """
    GET /patterns: Queries historical trade rejection and resolution patterns.
    """
    try:
        filters = {}
        if hs_code:
            filters["hs_code"] = hs_code
        if country:
            filters["country"] = country
        return engine.query_patterns(filters)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
