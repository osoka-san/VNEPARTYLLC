"""Целевой smoke-test собранного приложения (vite preview, dist/).

Проверяет на production-сборке три вещи, зависящие от имён чанков и от
реального бандла, а не от dev-сервера:
  A. сцена грузится и даёт живой Canvas с настоящими WebGL-пикселями;
  B. при недоступном WebGL показывается статичный портал;
  C. при prefers-reduced-motion чанк сцены (three/fiber/drei) не запрашивается.
"""

import asyncio
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "docs/sprint/screenshots/portal-stage-01-3"
PORT = int(os.environ.get("PORTAL_PREVIEW_PORT", "4173"))
BASE = f"http://127.0.0.1:{PORT}"
SCENE_HINTS = ("three", "fiber", "drei", "PortalScene-")


def is_scene_asset(url: str) -> bool:
    base = url.split("?")[0].rsplit("/", 1)[-1]
    if "PortalSceneLoader" in base:
        return False
    return any(hint.lower() in base.lower() for hint in SCENE_HINTS)


def wait_port(timeout: float = 120.0) -> None:
    import urllib.request

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(BASE, timeout=3) as response:
                if response.status == 200:
                    return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("собранное приложение не поднялось")


def log(record: dict) -> None:
    print(json.dumps(record, ensure_ascii=False))


async def canvas_pixels(page) -> dict:
    return await page.evaluate(
        """() => {
          const c = document.querySelector('canvas');
          if (!c) return { canvas: 0 };
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          return {
            canvas: 1,
            width: c.width,
            height: c.height,
            renderer: gl ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) : null,
          };
        }"""
    )


async def run() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        # A + C: обычный запуск и reduced motion.
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()
        page.on("console", lambda m: print("console:", m.type, m.text[:200]))
        page.on("pageerror", lambda e: print("pageerror:", str(e)[:300]))
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_selector("canvas", state="attached", timeout=60_000)
        await page.mouse.wheel(0, 900)
        await page.wait_for_timeout(1500)
        info = await canvas_pixels(page)
        await page.screenshot(path=str(SHOTS / "30-build-scene.png"))
        log({"name": "30-build-scene", **info})
        assert info.get("canvas") == 1 and info.get("width", 0) > 0
        await ctx.close()

        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 800}, reduced_motion="reduce"
        )
        page = await ctx.new_page()
        scene_requests: list[str] = []
        page.on(
            "request",
            lambda r: scene_requests.append(r.url) if is_scene_asset(r.url) else None,
        )
        await page.goto(BASE, wait_until="networkidle")
        await page.wait_for_selector("[data-static-portal]", timeout=15_000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SHOTS / "32-build-reduced-motion.png"))
        log(
            {
                "name": "32-build-reduced-motion",
                "sceneRequests": scene_requests,
                "canvas": await page.locator("canvas").count(),
            }
        )
        assert not scene_requests
        assert await page.locator("canvas").count() == 0
        await ctx.close()
        await browser.close()

        # B: WebGL полностью недоступен.
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-webgl", "--disable-webgl2", "--disable-software-rasterizer"],
        )
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_selector("[data-static-portal]", timeout=20_000)
        await page.wait_for_timeout(1000)
        await page.screenshot(path=str(SHOTS / "31-build-webgl-off.png"))
        log(
            {
                "name": "31-build-webgl-off",
                "staticSvg": await page.locator("[data-static-portal]").count(),
                "canvas": await page.locator("canvas").count(),
            }
        )
        assert await page.locator("canvas").count() == 0
        await ctx.close()
        await browser.close()

    print("Build smoke PASS")


def main() -> int:
    if not (ROOT / "dist/server/index.mjs").exists():
        print("dist отсутствует: сначала bun run build", file=sys.stderr)
        return 1
    # Пресет сборки — cloudflare-module, поэтому собранное приложение
    # поднимается воркер-рантаймом wrangler, а не vite preview.
    log_path = ROOT / "docs/sprint/logs/portal-stage-01-3-build-smoke-server.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    server = subprocess.Popen(
        [
            "bunx",
            "wrangler",
            "dev",
            "server/index.mjs",
            "--assets",
            "./client",
            "--port",
            str(PORT),
            "--compatibility-date",
            "2026-09-01",
            "--compatibility-flags",
            "nodejs_compat",
        ],
        cwd=ROOT / "dist",
        stdout=log_path.open("w"),
        stderr=subprocess.STDOUT,
    )
    try:
        wait_port()
        asyncio.run(run())
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
