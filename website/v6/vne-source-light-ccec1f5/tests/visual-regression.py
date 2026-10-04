#!/usr/bin/env python3
"""Deterministic visual regression audit for every public VNE HTML route.

Usage:
  bun run test:visual:update  # intentionally replace the committed baseline
  bun run test:visual         # compare the current UI with that baseline
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import time
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance
from playwright.async_api import Page, async_playwright

BASE_URL = os.environ.get("VNE_VISUAL_BASE_URL", "http://localhost:8080")
ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "docs/sprint/visual-regression"
BASELINE = ARTIFACTS / "baseline"
CURRENT = ARTIFACTS / "current"
DIFF = ARTIFACTS / "diff"
REPORT = ARTIFACTS / "report.json"

# Differences below the channel threshold are ignored. A frame fails when more
# than 0.1% of its pixels differ, keeping anti-aliasing noise out while catching
# visible layout, typography, image, and content regressions.
CHANNEL_THRESHOLD = 16
MAX_CHANGED_RATIO = 0.001

VIEWPORTS = {
    "360": (360, 800),
    "390": (390, 844),
    "430": (430, 932),
    "1440": (1440, 900),
    "1920": (1920, 1080),
}

ROUTES = {
    "home": "/",
    "events": "/events",
    "event-light-study-01": "/events/light-study-01",
    "event-threshold-study-02": "/events/threshold-study-02",
    "apply": "/apply?event=light-study-01",
    "about": "/about",
    "rules": "/rules",
    "faq": "/faq",
    "contact": "/contact",
    "privacy": "/privacy",
    "consent": "/consent",
    "terms": "/terms",
    "refunds": "/refunds",
    "cookies": "/cookies",
    "invitation-code": "/i/visual-audit",
    "card-code": "/c/visual-audit",
    "member": "/member",
    "admin": "/admin",
    "scan": "/scan",
}

STABILIZE_CSS = """
*, *::before, *::after {
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
}
"""


async def settle(page: Page) -> None:
    await page.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()")
    await page.wait_for_function(
        """() => [...document.images].every((image) => image.complete && image.naturalWidth > 0)""",
        timeout=15_000,
    )
    await page.wait_for_timeout(100)
    # Hash scrolling may run after hydration. Reset only after the page and its
    # media have settled so every route is captured from the same top origin.
    await page.evaluate("window.scrollTo(0, 0)")
    await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")


def compare(expected_path: Path, actual_path: Path, diff_path: Path) -> dict:
    with Image.open(expected_path).convert("RGB") as expected, Image.open(actual_path).convert("RGB") as actual:
        if expected.size != actual.size:
            return {
                "passed": False,
                "reason": "size-mismatch",
                "expectedSize": list(expected.size),
                "actualSize": list(actual.size),
                "changedPixels": actual.width * actual.height,
                "changedRatio": 1,
            }

        raw_diff = ImageChops.difference(expected, actual)
        mask = raw_diff.convert("L").point(lambda value: 255 if value > CHANNEL_THRESHOLD else 0)
        histogram = mask.histogram()
        changed_pixels = sum(histogram[1:])
        total_pixels = expected.width * expected.height
        changed_ratio = changed_pixels / total_pixels
        passed = changed_ratio <= MAX_CHANGED_RATIO
        if passed:
            diff_path.unlink(missing_ok=True)
        else:
            diff_path.parent.mkdir(parents=True, exist_ok=True)
            ImageEnhance.Contrast(raw_diff).enhance(4).save(diff_path, optimize=True)
        return {
            "passed": passed,
            "reason": None if passed else "pixel-difference",
            "changedPixels": changed_pixels,
            "changedRatio": round(changed_ratio, 8),
        }


async def audit(update_baseline: bool) -> int:
    CURRENT.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(DIFF, ignore_errors=True)
    DIFF.mkdir(parents=True, exist_ok=True)
    if update_baseline:
        shutil.rmtree(BASELINE, ignore_errors=True)
        BASELINE.mkdir(parents=True, exist_ok=True)

    entries: list[dict] = []
    runtime_errors: list[str] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        for viewport_name, (width, height) in VIEWPORTS.items():
            context = await browser.new_context(
                viewport={"width": width, "height": height},
                device_scale_factor=1,
                reduced_motion="reduce",
                color_scheme="dark",
                locale="ru-RU",
            )
            page = await context.new_page()
            page.on("pageerror", lambda error: runtime_errors.append(str(error)))
            await page.add_style_tag(content=STABILIZE_CSS)
            for route_name, route in ROUTES.items():
                response = await page.goto(BASE_URL + route, wait_until="domcontentloaded")
                if response is None or response.status >= 400:
                    raise AssertionError(f"HTTP failure: {route} ({response.status if response else 'none'})")
                await page.add_style_tag(content=STABILIZE_CSS)
                await settle(page)
                overflow = await page.evaluate(
                    "document.documentElement.scrollWidth - document.documentElement.clientWidth"
                )
                if overflow > 1:
                    raise AssertionError(f"Horizontal overflow {overflow}px: {viewport_name} {route}")

                filename = f"{viewport_name}--{route_name}.png"
                actual_path = CURRENT / filename
                expected_path = BASELINE / filename
                diff_path = DIFF / filename
                await page.screenshot(path=str(actual_path), animations="disabled")

                hero_source = None
                if route == "/":
                    hero_source = await page.locator("[data-gallery-background='hero'] img").evaluate(
                        "image => image.currentSrc"
                    )

                if update_baseline:
                    shutil.copy2(actual_path, expected_path)
                    comparison = {"passed": True, "reason": "baseline-updated", "changedPixels": 0, "changedRatio": 0}
                elif not expected_path.exists():
                    comparison = {"passed": False, "reason": "missing-baseline", "changedPixels": None, "changedRatio": None}
                else:
                    comparison = compare(expected_path, actual_path, diff_path)

                entries.append(
                    {
                        "viewport": {"name": viewport_name, "width": width, "height": height},
                        "routeName": route_name,
                        "route": route,
                        "status": response.status,
                        "title": await page.title(),
                        "horizontalOverflow": overflow,
                        "heroSource": hero_source,
                        "baseline": str(expected_path.relative_to(ROOT)),
                        "current": str(actual_path.relative_to(ROOT)),
                        "diff": str(diff_path.relative_to(ROOT)) if diff_path.exists() else None,
                        **comparison,
                    }
                )
            await context.close()
        await browser.close()

    failures = [entry for entry in entries if not entry["passed"]]
    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mode": "update-baseline" if update_baseline else "compare",
        "baseUrl": BASE_URL,
        "thresholds": {"channel": CHANNEL_THRESHOLD, "maxChangedRatio": MAX_CHANGED_RATIO},
        "routeCount": len(ROUTES),
        "viewportCount": len(VIEWPORTS),
        "captureCount": len(entries),
        "passed": not failures and not runtime_errors,
        "failureCount": len(failures),
        "runtimeErrors": runtime_errors,
        "entries": entries,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    if runtime_errors:
        print("Runtime errors:", *runtime_errors, sep="\n- ")
    print(
        f"{'PASS' if report['passed'] else 'FAIL'}: {len(entries)} visual captures, "
        f"{len(failures)} regressions, {len(runtime_errors)} runtime errors"
    )
    return 0 if report["passed"] else 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="Intentionally replace all committed baseline images.",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(audit(args.update_baseline)))


if __name__ == "__main__":
    main()