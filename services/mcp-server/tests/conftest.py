"""Pytest configuration — put the mcp-server package on the import path."""

from __future__ import annotations

import os
import sys

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)
