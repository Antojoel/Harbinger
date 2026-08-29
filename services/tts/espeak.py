"""
Point Kokoro's phonemizer at a working espeak-ng.

The ``espeakng-loader`` wheel that Kokoro pulls in ships a prebuilt
``libespeak-ng`` whose data path is hard-compiled to the upstream CI build
directory, so on most machines it fails with::

    Error processing file '/home/runner/work/.../espeak-ng-data/phontab'

Preferring a system ``libespeak-ng`` (installed in the image) plus a real
``espeak-ng-data`` directory fixes it. Import this module before ``kokoro``.
"""

from __future__ import annotations

import ctypes.util
import logging
import os

logger = logging.getLogger("harbinger.tts")

_LIB_NAMES = ("libespeak-ng.so.1", "libespeak-ng.so")
_LIB_DIRS = ("/usr/lib64", "/usr/lib/x86_64-linux-gnu", "/usr/lib", "/usr/local/lib")
_DATA_DIRS = (
    "/usr/share/espeak-ng-data",
    "/usr/local/share/espeak-ng-data",
    "/usr/lib/x86_64-linux-gnu/espeak-ng-data",
)


def _find_system_library() -> str | None:
    env_lib = os.getenv("PHONEMIZER_ESPEAK_LIBRARY")
    if env_lib and os.path.exists(env_lib):
        return env_lib
    located = ctypes.util.find_library("espeak-ng")
    if located:
        return located
    for base in _LIB_DIRS:
        for name in _LIB_NAMES:
            candidate = os.path.join(base, name)
            if os.path.exists(candidate):
                return candidate
    return None


def _find_system_data() -> str | None:
    env_data = os.getenv("ESPEAK_DATA_PATH")
    search = (env_data, *_DATA_DIRS) if env_data else _DATA_DIRS
    for path in search:
        if path and os.path.isfile(os.path.join(path, "phontab")):
            return path
    return None


def configure() -> None:
    """Best-effort: wire the phonemizer to a usable espeak-ng. Never raises."""
    library = _find_system_library()
    data = _find_system_data()
    if data:
        os.environ.setdefault("ESPEAK_DATA_PATH", data)

    try:
        from phonemizer.backend.espeak.wrapper import EspeakWrapper

        if library:
            EspeakWrapper.set_library(library)
            logger.info("espeak-ng library: %s", library)
        if data and hasattr(EspeakWrapper, "set_data_path"):
            EspeakWrapper.set_data_path(data)
            logger.info("espeak-ng data: %s", data)
    except Exception as exc:  # noqa: BLE001 - best-effort; must never break startup
        logger.warning(
            "could not pre-configure espeak-ng (%s); using package default", exc
        )
