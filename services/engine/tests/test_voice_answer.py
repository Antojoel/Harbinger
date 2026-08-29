"""Unit tests for the graph-driven spoken risk answer."""

from __future__ import annotations

from typing import ClassVar

import pytest
from voice import answer as answer_module


@pytest.fixture
def fake_graph(monkeypatch):
    """Stub graph_client.execute_read; each test sets `fake_graph.rows`."""

    class FakeGraph:
        rows: ClassVar[list] = []
        last_params: ClassVar[dict] = {}

        def execute_read(self, _query, **params):
            self.last_params = params
            return self.rows

    fake = FakeGraph()
    monkeypatch.setattr(answer_module, "graph_client", fake)
    return fake


@pytest.mark.unit
class TestBuildSpokenAnswer:
    def test_requires_a_shipment_id(self, fake_graph):
        assert "need a shipment number" in answer_module.build_spoken_answer("", "hi")

    def test_unknown_shipment(self, fake_graph):
        fake_graph.rows = []

        text = answer_module.build_spoken_answer("MSKU9", "what's the risk")

        assert "don't have a record for shipment MSKU9" in text
        assert fake_graph.last_params == {"shipment_id": "MSKU9"}

    def test_cleared_shipment_with_no_patterns(self, fake_graph):
        fake_graph.rows = [{"status": "cleared", "patterns": []}]

        text = answer_module.build_spoken_answer("MSKU1", "risk?")

        assert "cleared customs" in text

    def test_known_shipment_no_patterns_not_cleared(self, fake_graph):
        fake_graph.rows = [{"status": "pending", "patterns": [{"pattern_id": None}]}]

        text = answer_module.build_spoken_answer("MSKU1", "risk?")

        assert "no known hold risks" in text

    def test_single_high_risk_pattern(self, fake_graph):
        fake_graph.rows = [
            {
                "status": "held",
                "patterns": [
                    {
                        "pattern_id": "PAT-001",
                        "type": "unit_mismatch",
                        "detail": "Invoice 500 vs Packing List 480",
                        "confidence": 0.82,
                    }
                ],
            }
        ]

        text = answer_module.build_spoken_answer("MSKU1234567", "hold risk?")

        assert "high risk" in text
        assert "82 percent" in text
        assert "Invoice 500 vs Packing List 480" in text
        assert "currently held" in text
        assert "more issue" not in text

    def test_multiple_patterns_reports_top_and_count(self, fake_graph):
        fake_graph.rows = [
            {
                "status": "held",
                "patterns": [
                    {
                        "pattern_id": "PAT-014",
                        "type": "missing_certificate",
                        "detail": "No CoO",
                        "confidence": 0.6,
                    },
                    {
                        "pattern_id": "PAT-001",
                        "type": "unit_mismatch",
                        "detail": "unit gap",
                        "confidence": 0.82,
                    },
                    {
                        "pattern_id": "PAT-002",
                        "type": "hs_code_deprecated",
                        "detail": "old code",
                        "confidence": 0.4,
                    },
                ],
            }
        ]

        text = answer_module.build_spoken_answer("MSKU1", "risk?")

        assert "unit gap" in text  # highest confidence wins
        assert "2 more issues." in text

    def test_elevated_and_low_bands(self, fake_graph):
        fake_graph.rows = [
            {
                "status": "pending",
                "patterns": [
                    {"pattern_id": "P", "type": "t", "detail": "d", "confidence": 0.5}
                ],
            }
        ]
        assert "elevated risk" in answer_module.build_spoken_answer("S1", "")

        fake_graph.rows = [
            {
                "status": "pending",
                "patterns": [
                    {"pattern_id": "P", "type": "t", "detail": "d", "confidence": 0.2}
                ],
            }
        ]
        assert "low risk" in answer_module.build_spoken_answer("S1", "")
