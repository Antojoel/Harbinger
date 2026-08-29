"""Unit tests for the Harbinger MCP adapter tools (no live engine)."""

from __future__ import annotations

import json
from typing import Any, ClassVar

import httpx
import pytest

import server


@pytest.fixture
def captured_requests():
    return []


def _mock_client_factory(handler):
    def factory() -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler))

    return factory


@pytest.fixture
def engine(monkeypatch, captured_requests):
    """Install a fake engine; each test sets `engine.response`."""

    class FakeEngine:
        response: ClassVar[Any] = {"ok": True}
        status_code: ClassVar[int] = 200

        def handler(self, request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content) if request.content else None
            captured_requests.append(
                {
                    "method": request.method,
                    "url": str(request.url),
                    "path": request.url.path,
                    "params": dict(request.url.params),
                    "json": body,
                }
            )
            if isinstance(self.response, httpx.Response):
                return self.response
            return httpx.Response(self.status_code, json=self.response)

    fake = FakeEngine()
    monkeypatch.setattr(server, "_make_client", _mock_client_factory(fake.handler))
    return fake


@pytest.mark.unit
class TestCheckShipmentRisk:
    async def test_posts_to_simulate_with_full_payload(self, engine, captured_requests):
        engine.response = {
            "shipment_id": "MSKU1",
            "risk_score": 0.73,
            "reasons": [{"code": "UNIT_MISMATCH", "detail": "500 vs 480"}],
            "matched_patterns": ["PAT-001"],
        }

        result = await server.check_shipment_risk(
            "MSKU1",
            documents={"commercial_invoice": {"units": 500}},
            hs_code="8471.30",
            country="DE",
        )

        assert result["risk_score"] == 0.73
        sent = captured_requests[-1]
        assert sent["method"] == "POST"
        assert sent["path"] == "/api/simulate"
        assert sent["json"] == {
            "shipment_id": "MSKU1",
            "documents": {"commercial_invoice": {"units": 500}},
            "hs_code": "8471.30",
            "country": "DE",
        }

    async def test_omits_optional_fields_when_not_given(
        self, engine, captured_requests
    ):
        engine.response = {"shipment_id": "MSKU1", "risk_score": 0.0}

        await server.check_shipment_risk("MSKU1")

        assert captured_requests[-1]["json"] == {
            "shipment_id": "MSKU1",
            "documents": {},
        }


@pytest.mark.unit
class TestCheckShipmentRiskFromDocuments:
    async def test_posts_documents_as_base64_with_defaults(self, engine, captured_requests):
        engine.response = {
            "shipment_id": "MSKU1",
            "risk_score": 0.0,
            "extracted_documents": {},
        }

        result = await server.check_shipment_risk_from_documents(
            "MSKU1",
            "DE",
            commercial_invoice_base64="aW52b2ljZQ==",
            packing_list_base64="cGFja2luZw==",
            bill_of_lading_base64="Ym9s",
        )

        assert result["risk_score"] == 0.0
        sent = captured_requests[-1]
        assert sent["method"] == "POST"
        assert sent["path"] == "/api/simulate-from-documents"
        assert sent["json"] == {
            "shipment_id": "MSKU1",
            "country": "DE",
            "commercial_invoice": {"filename": "invoice.pdf", "content_base64": "aW52b2ljZQ=="},
            "packing_list": {"filename": "packing_list.pdf", "content_base64": "cGFja2luZw=="},
            "bill_of_lading": {"filename": "bill_of_lading.pdf", "content_base64": "Ym9s"},
        }

    async def test_includes_certificate_when_provided(self, engine, captured_requests):
        engine.response = {"shipment_id": "MSKU1", "risk_score": 0.0}

        await server.check_shipment_risk_from_documents(
            "MSKU1",
            "DE",
            commercial_invoice_base64="aQ==",
            packing_list_base64="cA==",
            bill_of_lading_base64="Yg==",
            certificate_of_origin_base64="Yw==",
            certificate_of_origin_filename="coo.pdf",
        )

        sent = captured_requests[-1]["json"]
        assert sent["certificate_of_origin"] == {"filename": "coo.pdf", "content_base64": "Yw=="}

    async def test_omits_certificate_when_not_provided(self, engine, captured_requests):
        engine.response = {"shipment_id": "MSKU1", "risk_score": 0.0}

        await server.check_shipment_risk_from_documents(
            "MSKU1", "DE",
            commercial_invoice_base64="aQ==", packing_list_base64="cA==", bill_of_lading_base64="Yg==",
        )

        assert "certificate_of_origin" not in captured_requests[-1]["json"]


@pytest.mark.unit
class TestRecordOutcomeTool:
    async def test_assembles_actual_outcome(self, engine, captured_requests):
        engine.response = {"status": "recorded", "pattern_updated": True}

        await server.record_outcome_tool(
            "MSKU1", was_held=True, reason_code="MISSING_CERTIFICATE", detail="no CoO"
        )

        assert captured_requests[-1]["json"] == {
            "shipment_id": "MSKU1",
            "actual_outcome": {
                "was_held": True,
                "reason_code": "MISSING_CERTIFICATE",
                "detail": "no CoO",
            },
        }

    async def test_minimal_outcome_only_was_held(self, engine, captured_requests):
        engine.response = {"status": "recorded", "pattern_updated": False}

        await server.record_outcome_tool("MSKU1", was_held=False)

        assert captured_requests[-1]["json"]["actual_outcome"] == {"was_held": False}


@pytest.mark.unit
class TestQueryPatternsTool:
    async def test_passes_filters_as_query_params(self, engine, captured_requests):
        engine.response = {"patterns": []}

        await server.query_patterns_tool(hs_code="8471.30", country="DE")

        sent = captured_requests[-1]
        assert sent["method"] == "GET"
        assert sent["path"] == "/api/patterns"
        assert sent["params"] == {"hs_code": "8471.30", "country": "DE"}

    async def test_no_filters(self, engine, captured_requests):
        engine.response = {"patterns": [{"pattern_id": "PAT-001"}]}

        result = await server.query_patterns_tool()

        assert result["patterns"][0]["pattern_id"] == "PAT-001"
        assert captured_requests[-1]["params"] == {}


@pytest.mark.unit
class TestEngineErrorHandling:
    async def test_http_500_becomes_structured_error(self, engine):
        engine.status_code = 500
        engine.response = {"detail": "boom"}

        result = await server.check_shipment_risk("MSKU1")

        assert result["error"] == "engine returned HTTP 500"

    async def test_connection_failure_becomes_structured_error(self, monkeypatch):
        def exploding_handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        monkeypatch.setattr(
            server, "_make_client", _mock_client_factory(exploding_handler)
        )

        result = await server.query_patterns_tool()

        assert result["error"] == "engine_unreachable"
        assert "connection refused" in result["detail"]


@pytest.mark.unit
class TestToolRegistration:
    async def test_three_tools_registered_with_schemas(self):
        tools = await server.mcp.list_tools()

        names = {t.name for t in tools}
        assert names == {
            "check_shipment_risk",
            "check_shipment_risk_from_documents",
            "record_outcome_tool",
            "query_patterns_tool",
        }
        for tool in tools:
            assert tool.description
            assert tool.inputSchema["type"] == "object"

    async def test_engine_url_has_no_trailing_slash(self):
        assert not server.ENGINE_URL.endswith("/")
