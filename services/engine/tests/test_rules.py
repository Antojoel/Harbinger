"""Unit tests for the pure document-contradiction rules."""

from __future__ import annotations

import pytest
from graph import rules


@pytest.mark.unit
class TestUnitMismatch:
    def test_flags_differing_unit_counts(self):
        documents = {
            "commercial_invoice": {"units": 500},
            "packing_list": {"units": 480},
        }

        detail = rules.detect_unit_mismatch(documents)

        assert detail == "Invoice lists 500 units, Packing List lists 480"

    def test_silent_when_counts_match(self):
        documents = {
            "commercial_invoice": {"units": 500},
            "packing_list": {"units": 500},
        }

        assert rules.detect_unit_mismatch(documents) is None

    def test_silent_when_a_document_is_missing(self):
        assert (
            rules.detect_unit_mismatch({"commercial_invoice": {"units": 500}}) is None
        )

    def test_silent_when_units_absent(self):
        documents = {"commercial_invoice": {}, "packing_list": {"units": 480}}

        assert rules.detect_unit_mismatch(documents) is None

    def test_treats_explicit_null_document_as_missing(self):
        documents = {"commercial_invoice": {"units": 500}, "packing_list": None}

        assert rules.detect_unit_mismatch(documents) is None


@pytest.mark.unit
class TestMissingCertificate:
    def test_flags_when_required_and_absent(self):
        detail = rules.detect_missing_certificate(
            ["Certificate of Origin"], {"certificate_of_origin": None}
        )

        assert "Certificate of Origin" in detail

    def test_sorts_multiple_certificate_names(self):
        detail = rules.detect_missing_certificate(
            ["EUR.1 Movement Certificate", "Certificate of Origin"],
            {"certificate_of_origin": None},
        )

        assert detail.index("Certificate of Origin") < detail.index("EUR.1")

    def test_silent_when_certificate_present(self):
        detail = rules.detect_missing_certificate(
            ["Certificate of Origin"], {"certificate_of_origin": {"id": "CoO-1"}}
        )

        assert detail is None

    def test_silent_when_nothing_required(self):
        assert (
            rules.detect_missing_certificate([], {"certificate_of_origin": None})
            is None
        )


@pytest.mark.unit
class TestHsCodeDeprecated:
    def test_flags_with_replacement(self):
        detail = rules.detect_hs_code_deprecated("8504.40", True, "8504.41")

        assert detail == "HS code 8504.40 is deprecated; use 8504.41"

    def test_flags_without_replacement(self):
        detail = rules.detect_hs_code_deprecated("8504.40", True, None)

        assert detail == "HS code 8504.40 is deprecated"

    def test_silent_when_not_deprecated(self):
        assert rules.detect_hs_code_deprecated("8471.30", False, None) is None


@pytest.mark.unit
class TestHsCodeMismatch:
    def test_flags_when_invoice_disagrees(self):
        documents = {"commercial_invoice": {"hs_code": "8471.30"}}

        detail = rules.detect_hs_code_mismatch(documents, "8517.13")

        assert "8471.30" in detail and "8517.13" in detail

    def test_silent_when_codes_match(self):
        documents = {"commercial_invoice": {"hs_code": "8471.30"}}

        assert rules.detect_hs_code_mismatch(documents, "8471.30") is None

    def test_silent_when_invoice_has_no_code(self):
        assert (
            rules.detect_hs_code_mismatch({"commercial_invoice": {}}, "8471.30") is None
        )
