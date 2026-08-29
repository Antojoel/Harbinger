"""
In-memory shipment store for the demo UI.
==========================================
This is NOT a database — it's a lightweight, in-process store so the
Control Tower dashboard has something to list/click into. It exists
because the Emergent-generated frontend (apps/ClearanceGuard-main,
ported into apps/web) expects a shipment catalog, which the original
locked API contract never included.

Each shipment carries two representations of its documents:
- `engine_documents`: the canonical shape graph_client.find_matching_patterns()
  actually checks (snake_case, units/hs_code fields) — this is what gets
  sent to engine.simulate(), unmodified.
- `ui_documents`: a richer, human-readable list for the dashboard's document
  tabs (invoice numbers, values, etc.) — display only, never touches the
  engine.

HS codes/countries below are deliberately chosen to match what Vignesh
actually seeded in Neo4j (services/engine/app/seed/seed_data.py):
8471.30 + DE requires "Certificate of Origin"; 8504.41 + DE requires
"EUR.1 Movement Certificate". Using any other HS/country combo would make
the missing-certificate check silently never fire (find_matching_patterns
looks up requirements from the graph, not from anything in this file).
"""

import copy
from typing import Any, Dict, List, Optional

_SHIPMENTS: Dict[str, Dict[str, Any]] = {}
_TOTALS = {"cost_avoided_inr": 0, "outcomes_recorded": 0}
_EMAIL_LOG: List[Dict[str, Any]] = [
    {
        "id": "msg_001",
        "shipment_id": "MSKU1234567",
        "recipient_email": "exporter-ops@shanghaiforwarding.cn",
        "subject": "Action needed: Certificate of Origin for MSKU1234567",
        "body": "Dear team,\n\nShipment MSKU1234567 (Industrial Inverters & Converters, HS 8471.30) cannot be filed because the Certificate of Origin is not attached. This certificate is required for HS code 8471.30 into Germany. Please share it at the earliest to avoid demurrage.\n\nRegards,\nClearanceGuard Compliance Team",
        "status": "sent",
        "created_at": "2026-08-30T02:15:00Z",
    },
    {
        "id": "msg_002",
        "shipment_id": "HLX9988221",
        "recipient_email": "compliance@fastcargo.de",
        "subject": "Unit Mismatch Escalation - HLX9988221",
        "body": "Attn Compliance,\n\nCommercial Invoice lists 1200 units while Packing List lists 1250 units for shipment HLX9988221. Please review revised Commercial Invoice prior to customs lodgement.",
        "status": "awaiting_keys",
        "created_at": "2026-08-30T03:40:00Z",
    },
]



def _make(
    shipment_id: str,
    ref: str,
    importer_name: str,
    exporter: str,
    hs_code: str,
    country: str,
    goods_desc: str,
    pol: str,
    pod: str,
    invoice_units: int,
    packing_units: int,
    invoice_hs_code: Optional[str] = None,
    has_certificate: bool = True,
    demurrage_per_day_inr: int = 5000,
    status: str = "Draft",
) -> Dict[str, Any]:
    """`hs_code` is the shipment's DECLARED HS code — used for the
    certificate-requirement lookup in Neo4j and compared against the
    invoice's own HS code by graph.rules.detect_hs_code_mismatch(). Pass
    `invoice_hs_code` different from `hs_code` to trigger that specific
    contradiction; leave it unset for everything else."""
    invoice_hs = invoice_hs_code or hs_code
    engine_documents = {
        "commercial_invoice": {"units": invoice_units, "hs_code": invoice_hs},
        "packing_list": {"units": packing_units},
        "bill_of_lading": {"hs_code": hs_code},
        "certificate_of_origin": ({"issued": True}) if has_certificate else None,
    }

    ui_documents = [
        {
            "type": "CommercialInvoice",
            "fields": {"invoice_no": f"INV-{shipment_id[-4:]}", "hs_code": invoice_hs, "quantity": f"{invoice_units} units"},
            "fixed": [],
        },
        {
            "type": "PackingList",
            "fields": {"hs_code": hs_code, "quantity": f"{packing_units} units"},
            "fixed": [],
        },
        {
            "type": "BillOfLading",
            "fields": {"bl_no": f"BL-{shipment_id[-4:]}", "hs_code": hs_code},
            "fixed": [],
        },
    ]
    if has_certificate:
        ui_documents.append({
            "type": "CertificateOfOrigin",
            "fields": {"coo_no": f"COO-{shipment_id[-4:]}", "origin_country": "CN"},
            "fixed": [],
        })

    return {
        "id": shipment_id,
        "ref": ref,
        "importer_name": importer_name,
        "exporter": exporter,
        "hs_code": hs_code,
        "destination_country": country,
        "goods_desc": goods_desc,
        "pol": pol,
        "pod": pod,
        "status": status,
        "demurrage_per_day_inr": demurrage_per_day_inr,
        "engine_documents": engine_documents,
        "ui_documents": ui_documents,
        "latest_simulation": None,
    }


def _seed() -> None:
    _SHIPMENTS.clear()
    shipments = [
        # Hero: unit mismatch + missing Certificate of Origin (8471.30/DE requires one)
        _make("shp-0042", "SIRIUS-2026-0042", "Peenya Electronics Pvt Ltd", "Shenzhen TechWorks Ltd",
              "8471.30", "DE", "Laptop computers, 14-inch", "CNSZX", "DEHAM",
              invoice_units=500, packing_units=480, has_certificate=False, demurrage_per_day_inr=6200),
        # Missing certificate only
        _make("shp-0043", "SIRIUS-2026-0043", "Bommasandra Pharma Pvt Ltd", "Hangzhou Lifescience Co",
              "8471.30", "DE", "Networking hardware", "CNSHA", "DEHAM",
              invoice_units=300, packing_units=300, has_certificate=False, demurrage_per_day_inr=8400),
        # Unit mismatch only, auto-fixable (has the cert this HS/country needs, so only units flag)
        _make("shp-0044", "SIRIUS-2026-0044", "Whitefield Textiles Pvt Ltd", "Guangzhou Textile Mills",
              "8504.41", "DE", "Power adapters", "CNSHA", "DEHAM",
              invoice_units=220, packing_units=210, has_certificate=True, demurrage_per_day_inr=4100),
        # HS code mismatch only (invoice's HS code disagrees with the declared one)
        _make("shp-0045", "SIRIUS-2026-0045", "Peenya Electronics Pvt Ltd", "Shenzhen NetGear Ltd",
              "8471.30", "DE", "Wireless routers", "CNSZX", "DEHAM",
              invoice_units=220, packing_units=220, invoice_hs_code="8517.62",
              has_certificate=True, demurrage_per_day_inr=5300),
        # Clean shipments
        _make("shp-0046", "SIRIUS-2026-0046", "Peenya Electronics Pvt Ltd", "Shenzhen TechWorks Ltd",
              "8471.30", "DE", "Laptop computers, 15-inch", "CNSZX", "DEHAM",
              invoice_units=250, packing_units=250, has_certificate=True,
              demurrage_per_day_inr=5000, status="Ready to file"),
        _make("shp-0047", "SIRIUS-2026-0047", "Whitefield Textiles Pvt Ltd", "Guangzhou Textile Mills",
              "8504.41", "DE", "Power adapters, bulk", "CNSHA", "DEHAM",
              invoice_units=400, packing_units=400, has_certificate=True,
              demurrage_per_day_inr=4500, status="Ready to file"),
    ]
    for s in shipments:
        _SHIPMENTS[s["id"]] = s


_seed()


def list_shipments() -> List[Dict[str, Any]]:
    return [copy.deepcopy(s) for s in _SHIPMENTS.values()]


def get_shipment(shipment_id: str) -> Optional[Dict[str, Any]]:
    s = _SHIPMENTS.get(shipment_id)
    return copy.deepcopy(s) if s else None


def get_engine_documents(shipment_id: str) -> Optional[Dict[str, Any]]:
    s = _SHIPMENTS.get(shipment_id)
    return copy.deepcopy(s["engine_documents"]) if s else None


def set_latest_simulation(shipment_id: str, simulation: Dict[str, Any]) -> None:
    if shipment_id in _SHIPMENTS:
        _SHIPMENTS[shipment_id]["latest_simulation"] = simulation


def set_status(shipment_id: str, status: str) -> None:
    if shipment_id in _SHIPMENTS:
        _SHIPMENTS[shipment_id]["status"] = status


def apply_unit_mismatch_fix(shipment_id: str) -> bool:
    """Auto-fix: align packing_list units to the commercial_invoice's units.

    Only for the internal-transcription-defect case (unit mismatch) — never
    used for missing certificates, which always require a human-approved
    draft per the product's own rule.
    """
    s = _SHIPMENTS.get(shipment_id)
    if not s:
        return False
    invoice_units = s["engine_documents"]["commercial_invoice"]["units"]
    s["engine_documents"]["packing_list"]["units"] = invoice_units
    for doc in s["ui_documents"]:
        if doc["type"] == "PackingList":
            doc["fields"]["quantity"] = f"{invoice_units} units"
            if "unit count normalised" not in doc["fixed"]:
                doc["fixed"].append("unit count normalised")
    return True


def record_credit(amount_inr: int) -> None:
    _TOTALS["cost_avoided_inr"] += amount_inr


def record_outcome_event() -> None:
    _TOTALS["outcomes_recorded"] += 1


def get_totals() -> Dict[str, int]:
    return dict(_TOTALS)


def list_email_logs() -> List[Dict[str, Any]]:
    return list(_EMAIL_LOG)


def add_email_log(entry: Dict[str, Any]) -> Dict[str, Any]:
    _EMAIL_LOG.insert(0, entry)
    return entry

