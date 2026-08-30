"""Workspace context for the Harbinger assistant.

The assistant used to be handed one shipment's facts, which meant it could
only answer questions about that shipment — asking "how are all the
Whitefield Textiles containers doing?" got a truthful but useless "I only
have data for one shipment here".

This module assembles what the assistant actually needs to answer questions
about the whole book: every shipment with its current risk, aggregates by
importer / destination / HS code, which failure reasons dominate where, what
the immune-memory graph has learned, and a map of the product itself so it
can tell someone where to click.

Everything is computed from live state — the shipment store's simulations and
the Neo4j graph. Nothing here is stored or invented; if a number isn't
derivable it is left out rather than guessed.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("harbinger.workspace")

# Human labels for the engine's reason codes. The assistant speaks to
# compliance officers, not to the rule engine.
REASON_LABELS = {
    "UNIT_MISMATCH": "unit-count mismatch between the invoice and packing list",
    "MISSING_CERTIFICATE": "a required certificate is missing",
    "HS_CODE_MISMATCH": "the invoice HS code disagrees with the declared one",
    "HS_CODE_DEPRECATED": "the declared HS code has been superseded",
}

# What each screen is for, so the assistant can point someone at the right
# place instead of describing an action they can't find.
SITE_MAP = [
    {"page": "Overview", "path": "/", "purpose": "Portfolio dashboard: shipments checked, high-risk count, patterns learned, risk mix, recent shipments, engine activity and the top rejection reasons."},
    {"page": "Shipments", "path": "/shipments", "purpose": "The full manifest of every container, filterable by status and risk band. 'Add shipment' accepts manual entry or uploaded customs documents."},
    {"page": "Risk Check", "path": "/risk-check", "purpose": "Pick a shipment to open its full risk dossier: top issues, risk factors, recommended actions, cost if unfixed, and similar past cases."},
    {"page": "Patterns", "path": "/patterns", "purpose": "The pattern library — every failure pattern the engine has learned, with how often it has been seen and how confident the graph is."},
    {"page": "Graph Explorer", "path": "/graph", "purpose": "The immune-memory graph itself: HS codes, countries, certificates, documents, rejection reasons and patterns, and the edges between them. Filterable by node type."},
    {"page": "Pricing", "path": "/pricing", "purpose": "Plans, including pay-as-you-go per shipment checked, and the unit economics of a check versus a hold."},
    {"page": "Escalations", "path": "/email", "purpose": "Draft and log human-approved document requests to exporters and carriers. Nothing is auto-submitted to customs."},
    {"page": "Integrations", "path": "/integrations", "purpose": "REST and MCP endpoints for connecting Harbinger to other software, plus a voice API console."},
]


def _band(score: int) -> str:
    if score >= 60:
        return "high"
    if score >= 25:
        return "medium"
    return "low"


def _shipment_row(s: Dict[str, Any], reason_codes: List[str]) -> Dict[str, Any]:
    sim = s.get("latest_simulation") or {}
    return {
        "reference": s["ref"],
        "id": s["id"],
        "importer": s["importer_name"],
        "exporter": s.get("exporter"),
        "goods": s.get("goods_desc"),
        "hs_code": s.get("hs_code"),
        "destination": s.get("destination_country"),
        "route": f"{s.get('pol')} to {s.get('pod')}",
        "status": s.get("status"),
        "hold_risk_percent": sim.get("score", 0),
        "risk_band": sim.get("band", "low"),
        "issues": [REASON_LABELS.get(c, c) for c in reason_codes],
    }


def build_workspace_context(
    shipments: List[Dict[str, Any]],
    reason_codes_for: Callable[[str], List[str]],
    patterns: Optional[List[Dict[str, Any]]] = None,
    graph: Optional[Dict[str, Any]] = None,
    focus_importer: Optional[str] = None,
) -> Dict[str, Any]:
    """Assemble the assistant's view of the whole workspace.

    ``reason_codes_for`` resolves a shipment id to the reason codes its latest
    risk check raised — injected rather than imported so this module stays
    free of route-layer dependencies.
    """
    rows: List[Dict[str, Any]] = []
    codes_by_id: Dict[str, List[str]] = {}
    for s in shipments:
        try:
            codes = reason_codes_for(s["id"])
        except Exception:  # a single bad lookup must not blank the whole context
            codes = []
        codes_by_id[s["id"]] = codes
        rows.append(_shipment_row(s, codes))

    total = len(rows)
    bands = {"low": 0, "medium": 0, "high": 0}
    for r in rows:
        bands[r["risk_band"]] = bands.get(r["risk_band"], 0) + 1

    # --- aggregates the assistant is repeatedly asked about ---------------
    by_importer: Dict[str, Dict[str, Any]] = {}
    by_destination: Dict[str, Dict[str, Any]] = {}
    by_hs_code: Dict[str, Dict[str, Any]] = {}

    def _bucket(store: Dict[str, Dict[str, Any]], key: str, row: Dict[str, Any]) -> None:
        if not key:
            return
        b = store.setdefault(
            key, {"shipments": 0, "at_risk": 0, "issue_counts": {}, "total_risk": 0}
        )
        b["shipments"] += 1
        b["total_risk"] += row["hold_risk_percent"]
        if row["risk_band"] in ("high", "medium"):
            b["at_risk"] += 1
        for issue in row["issues"]:
            b["issue_counts"][issue] = b["issue_counts"].get(issue, 0) + 1

    for row in rows:
        _bucket(by_importer, row["importer"], row)
        _bucket(by_destination, row["destination"], row)
        _bucket(by_hs_code, row["hs_code"], row)

    def _finalise(store: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        out = {}
        for key, b in store.items():
            n = b["shipments"]
            issues = sorted(b["issue_counts"].items(), key=lambda kv: kv[1], reverse=True)
            out[key] = {
                "shipments": n,
                "at_risk": b["at_risk"],
                "average_hold_risk_percent": round(b["total_risk"] / n) if n else 0,
                "most_common_issues": [
                    {
                        "issue": issue,
                        "affected_shipments": count,
                        "share_percent": round(count * 100 / n) if n else 0,
                    }
                    for issue, count in issues[:3]
                ],
            }
        return out

    context: Dict[str, Any] = {
        "book_summary": {
            "total_shipments": total,
            "risk_mix": bands,
            "at_risk": bands["medium"] + bands["high"],
            "average_hold_risk_percent": (
                round(sum(r["hold_risk_percent"] for r in rows) / total) if total else 0
            ),
        },
        "by_importer": _finalise(by_importer),
        "by_destination": _finalise(by_destination),
        "by_hs_code": _finalise(by_hs_code),
        "site_map": SITE_MAP,
    }

    # The full per-shipment list is large; send it only when the question is
    # about one company, otherwise the aggregates above carry the answer.
    if focus_importer:
        matched = [r for r in rows if r["importer"] == focus_importer]
        context["shipments_for_focused_importer"] = {
            "importer": focus_importer,
            "shipments": sorted(matched, key=lambda r: -r["hold_risk_percent"]),
        }
    else:
        # Still name the riskiest few so "what needs attention?" is answerable.
        context["highest_risk_shipments"] = sorted(
            rows, key=lambda r: -r["hold_risk_percent"]
        )[:8]

    if patterns:
        context["learned_patterns"] = [
            {
                "type": p.get("type"),
                "times_seen": p.get("frequency"),
                "confidence_percent": round(float(p.get("confidence") or 0) * 100),
                "detail": p.get("detail"),
            }
            for p in patterns
        ]

    if graph:
        context["immune_memory_graph"] = _graph_shape(graph)

    return context


def _graph_shape(graph: Dict[str, Any]) -> Dict[str, Any]:
    """Summarise the graph so the assistant can explain what it *means*.

    The raw node/edge lists are noise to a language model; what matters is
    what kinds of things are in it, how they connect, and which certificate
    requirements exist for which lane — that last part is what turns "here is
    a graph" into "Germany keeps failing on certificates".
    """
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []

    node_types: Dict[str, int] = {}
    labels: Dict[str, str] = {}
    for n in nodes:
        node_types[n.get("type", "?")] = node_types.get(n.get("type", "?"), 0) + 1
        labels[n.get("id")] = n.get("label", n.get("id"))

    edge_types: Dict[str, int] = {}
    requirements: List[str] = []
    resolutions: List[str] = []
    for e in edges:
        t = e.get("type", "?")
        edge_types[t] = edge_types.get(t, 0) + 1
        src, dst = labels.get(e.get("from"), ""), labels.get(e.get("to"), "")
        if t == "REQUIRES" and src and dst:
            requirements.append(f"HS {src} requires {dst}")
        elif t == "RESOLVED_BY" and src and dst:
            resolutions.append(f"{src} is resolved by {dst}")

    return {
        "what_it_is": (
            "A knowledge graph of past customs clearances. Nodes are HS codes, "
            "destination countries, certificate requirements, document types, "
            "rejection reasons and learned failure patterns. Edges record which "
            "HS code requires which certificate into which country, which "
            "documents contradict each other, what caused a rejection, and what "
            "resolved it. Every recorded outcome adds to it, so the same failure "
            "is caught faster next time."
        ),
        "node_counts_by_type": node_types,
        "edge_counts_by_type": edge_types,
        "certificate_requirements": sorted(set(requirements)),
        "known_resolutions": sorted(set(resolutions)),
    }


def find_importer(question: str, shipments: List[Dict[str, Any]]) -> Optional[str]:
    """Best-effort match of a company named in a question to a real importer.

    People type "Whitefield Technologies" for "Whitefield Textiles Pvt Ltd",
    so matching is on significant words rather than the full string. Returns
    ``None`` when nothing matches, which lets the assistant say so honestly
    instead of answering about the wrong company.
    """
    q = (question or "").lower()
    if not q:
        return None

    # Words too generic to identify a company on their own.
    noise = {
        "pvt", "ltd", "limited", "private", "inc", "llp", "co", "company",
        "the", "and", "of", "from", "for", "all", "every", "shipments",
        "shipment", "containers", "container", "technologies", "technology",
    }

    best: Optional[str] = None
    best_score = 0
    seen = set()
    for s in shipments:
        name = s.get("importer_name") or ""
        if not name or name in seen:
            continue
        seen.add(name)
        words = [w for w in name.lower().replace(",", " ").split() if w not in noise]
        score = sum(1 for w in words if w and w in q)
        if score > best_score:
            best, best_score = name, score

    return best if best_score else None
