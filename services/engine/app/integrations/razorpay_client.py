"""
Razorpay integration (A8)
==========================
Real test-mode order creation and payment signature verification via the
official `razorpay` Python SDK. Reads credentials from the environment
(RAZORPAY_KEY, RAZORPAY_SECRET) — never hardcoded, never committed.

Amounts are in paise (Razorpay's smallest-currency-unit convention): 100
paise = ₹1.
"""

import logging
import os
from typing import Any, Dict, Optional

import razorpay
from razorpay.errors import SignatureVerificationError

logger = logging.getLogger("harbinger.razorpay")

RAZORPAY_KEY = os.getenv("RAZORPAY_KEY")
RAZORPAY_SECRET = os.getenv("RAZORPAY_SECRET")

# Per-shipment plan is the priced, "Most popular" tier in the UI (₹149).
# Success-fee plan has no fixed price in the UI copy, so this is a nominal
# ₹1 token charge to demonstrate a real activation transaction rather than
# an untested "0-rupee" order.
TIER_AMOUNTS_PAISE = {
    "per-shipment": 14900,
    "per_shipment": 14900,
    "success-fee": 100,
}
DEFAULT_AMOUNT_PAISE = 14900

_client: Optional[razorpay.Client] = None


def is_configured() -> bool:
    return bool(RAZORPAY_KEY and RAZORPAY_SECRET)


def _get_client() -> razorpay.Client:
    global _client
    if _client is None:
        _client = razorpay.Client(auth=(RAZORPAY_KEY, RAZORPAY_SECRET))
    return _client


def create_order(tier_id: str, shipment_id: Optional[str] = None) -> Dict[str, Any]:
    """Create a real Razorpay order in test mode.

    Returns the locked-contract shape {order_id, amount, currency,
    razorpay_key_id} on success, or {awaiting_keys: True, message} if
    credentials aren't configured — this is what lets the frontend show a
    friendly banner instead of crashing when keys are missing.
    """
    if not is_configured():
        return {
            "awaiting_keys": True,
            "message": "Razorpay keys not yet configured — add RAZORPAY_KEY/RAZORPAY_SECRET to enable live checkout.",
        }

    amount = TIER_AMOUNTS_PAISE.get(tier_id, DEFAULT_AMOUNT_PAISE)
    receipt = (f"shipment-{shipment_id}" if shipment_id else f"tier-{tier_id}")[:40]

    try:
        order = _get_client().order.create({
            "amount": amount,
            "currency": "INR",
            "receipt": receipt,
            "notes": {"tier_id": tier_id, "shipment_id": shipment_id or ""},
        })
    except Exception as exc:
        logger.error("Razorpay order creation failed: %s", exc)
        return {"awaiting_keys": True, "message": f"Razorpay order creation failed: {exc}"}

    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "razorpay_key_id": RAZORPAY_KEY,
    }


def verify_payment(order_id: str, payment_id: str, signature: str) -> bool:
    """Verify a completed checkout's HMAC signature server-side. Never
    trust a client-reported 'success' without this."""
    if not is_configured():
        return False
    try:
        _get_client().utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
        return True
    except SignatureVerificationError:
        logger.warning("Razorpay signature verification failed for order %s", order_id)
        return False
