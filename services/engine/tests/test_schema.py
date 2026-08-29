"""Unit tests for schema helpers (id scheme, confidence formula)."""

from __future__ import annotations

import pytest
from graph import schema


@pytest.mark.unit
class TestConfidenceFor:
    def test_zero_frequency_is_zero(self):
        assert schema.confidence_for(0) == 0.0
        assert schema.confidence_for(-3) == 0.0

    def test_first_sighting(self):
        # 1 / (1 + 3) == 0.25
        assert schema.confidence_for(1) == 0.25

    def test_monotonic_increasing_and_bounded(self):
        values = [schema.confidence_for(n) for n in (1, 5, 20, 100)]

        assert values == sorted(values)
        assert all(0.0 <= v < 1.0 for v in values)


@pytest.mark.unit
class TestNodeId:
    @pytest.mark.parametrize(
        ("label", "props", "expected"),
        [
            ("HSCode", {"code": "8471.30"}, "HSCode:8471.30"),
            ("Pattern", {"pattern_id": "PAT-001"}, "Pattern:PAT-001"),
            ("Country", {"code": "DE", "name": "Germany"}, "Country:DE"),
            (
                "RejectionReason",
                {"reason_code": "UNIT_MISMATCH"},
                "RejectionReason:UNIT_MISMATCH",
            ),
        ],
    )
    def test_uses_key_property(self, label, props, expected):
        assert schema.node_id(label, props) == expected

    def test_falls_back_when_key_missing(self):
        assert schema.node_id("HSCode", {}) == "HSCode:unknown"


@pytest.mark.unit
class TestPrimaryLabel:
    def test_picks_most_specific_known_label(self):
        assert schema.primary_label(["_Entity", "Pattern"]) == "Pattern"

    def test_falls_back_to_first_when_none_known(self):
        assert schema.primary_label(["Weird"]) == "Weird"

    def test_empty_label_list(self):
        assert schema.primary_label([]) == "Node"


@pytest.mark.unit
class TestNodeLabelText:
    def test_prefers_explicit_label(self):
        assert (
            schema.node_label_text("DocumentType", {"label": "Packing List"})
            == "Packing List"
        )

    def test_falls_back_to_description_then_label(self):
        assert schema.node_label_text("HSCode", {"description": "Laptops"}) == "Laptops"
        assert schema.node_label_text("HSCode", {}) == "HSCode"
