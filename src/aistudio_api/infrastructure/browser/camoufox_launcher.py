"""Compatibility launcher for Camoufox Playwright server.

Camoufox's bundled `camoufox.server.launch_server()` currently forwards
`None`-valued options such as `proxy=None`, which breaks startup in some
versions with errors like `proxy: expected object, got null`.

This module launches the same underlying Node script, but prunes `None`
values first so the generated config matches what the browser expects.
"""

from __future__ import annotations

import argparse
import base64
import subprocess
import sys
from pathlib import Path
from typing import Any

_SRC_ROOT = Path(__file__).resolve().parents[3]
if str(_SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(_SRC_ROOT))

import orjson
from camoufox.server import LAUNCH_SCRIPT, get_nodejs, to_camel_case_dict
from camoufox.utils import launch_options

from aistudio_api.infrastructure.browser.proxy import parse_proxy_url


def _prune_none(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _prune_none(item) for key, item in value.items() if item is not None}
    if isinstance(value, list):
        return [_prune_none(item) for item in value]
    return value


def launch_camoufox_server(*, port: int, headless: bool, proxy_url: str | None = None):
    launch_kwargs = {
        "port": port,
        "headless": headless,
        "main_world_eval": True,
    }
    proxy = parse_proxy_url(proxy_url)
    if proxy is not None:
        launch_kwargs["proxy"] = proxy
    cfg = launch_options(**launch_kwargs)
    cfg = _prune_none(cfg)
    nodejs = get_nodejs()
    data = orjson.dumps(to_camel_case_dict(cfg))

    process = subprocess.Popen(
        [nodejs, str(LAUNCH_SCRIPT)],
        cwd=Path(nodejs).parent / "package",
        stdin=subprocess.PIPE,
        text=True,
    )
    if process.stdin:
        process.stdin.write(base64.b64encode(data).decode())
        process.stdin.close()
    process.wait()
    raise RuntimeError("Server process terminated unexpectedly")


def main():
    parser = argparse.ArgumentParser(description="Launch Camoufox server with sanitized config")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--proxy-url")
    args = parser.parse_args()
    launch_camoufox_server(port=args.port, headless=args.headless, proxy_url=args.proxy_url)


if __name__ == "__main__":
    main()
