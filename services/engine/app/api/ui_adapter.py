"""
UI adapter — translates the locked engine contract (TASKS.md) into the
richer shape the ported frontend (apps/web, originally Emergent-generated)
expects. Pure presentation shaping, no business logic — that stays in
engine.py / graph.rules. Nothing here talks to Neo4j directly.
"""

from typing import Any, Dict, List


def score_band(score_0_100: int) -> str:
    if score_0_100 >= 60:
        return "high"
    if score_0_100 >= 25:
        return "medium"
    return "low"


def simulate_to_ui(engine_result: Dict[str, Any]) -> Dict[str, Any]:
    """Additional fields to merge into the locked /api/simulate response.

    engine_result is the untouched locked shape:
        {shipment_id, risk_score (0.0-1.0), reasons: [{code, detail}], matched_patterns}
    """
    score = round(engine_result["risk_score"] * 100)
    band = score_band(score)
    reasons = engine_result.get("reasons", [])

    if not reasons:
        summary = "No known failure patterns matched. Clear to file."
        recommended_default = "File as-is."
    else:
        summary = (
            f"{len(reasons)} issue(s) detected before filing — resolve these to avoid a customs hold."
        )
        human = [r for r in reasons if r["code"] == "MISSING_CERTIFICATE"]
        blocking = [r for r in reasons if r["code"] != "MISSING_CERTIFICATE"]
        if human:
            recommended_default = "Draft a certificate request to the exporter before filing."
        elif blocking:
            recommended_default = "Approve the auto-fix, then re-simulate before filing."
        else:
            recommended_default = "File as-is."

    checklist: List[Dict[str, Any]] = []
    if not reasons:
        checklist.append({"item": "All documents verified", "status": "ok", "action": None, "ref": None})
    for r in reasons:
        if r["code"] == "MISSING_CERTIFICATE":
            checklist.append({"item": r["detail"], "status": "pending_human", "action": "human_draft", "ref": r["code"]})
        else:
            checklist.append({"item": r["detail"], "status": "blocking", "action": "approve_fix", "ref": r["code"]})

    return {
        "score": score,
        "band": band,
        "summary": summary,
        "reasons": [r["detail"] for r in reasons],
        "recommended_default": recommended_default,
        "checklist": checklist,
    }


def outcome_to_ui(engine_result: Dict[str, Any], credited_inr: int) -> Dict[str, Any]:
    """Additional fields to merge into the locked /api/record-outcome response.

    engine_result is the untouched locked shape:
        {status, pattern_updated, new_nodes, new_edges}
    """
    new_nodes = engine_result.get("new_nodes", [])
    new_edges = engine_result.get("new_edges", [])
    return {
        "added_nodes": [{"id": n} for n in new_nodes],
        "added_edges": [{"id": f"{e['from']}->{e['to']}"} for e in new_edges],
        "outcome": {"credited_inr": credited_inr},
    }


def voice_answer(shipment_ref: str, simulation: Dict[str, Any]) -> str:
    """Plain-text answer for the voice widget. Browser handles STT/TTS
    client-side (Web Speech API) — this never touches audio at all, so it
    doesn't depend on Vertex AI / local-model work in V5."""
    if not simulation or not simulation.get("reasons"):
        return f"{shipment_ref} has no known hold risk right now."
    score = simulation.get("score", 0)
    reasons = simulation.get("reasons", [])
    lead = reasons[0] if reasons else "an unresolved issue"
    return f"{shipment_ref} is {score}% likely to be held. Top reason: {lead}"
