"""Static / reduced-motion placement matrix for the portal emblem.

Checks that the painted emblem never intersects the copy block, the primary CTA
or the dock, and that it is fully visible inside the viewport.
"""

import asyncio
import json
import os
import pathlib
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("PORTAL_BASE_URL", "http://localhost:8080")
OUT = pathlib.Path("docs/sprint/screenshots/portal-stage-01-3")
OUT.mkdir(parents=True, exist_ok=True)

SIZES = [
    (1440, 900),
    (390, 844),
    (360, 740),
    (500, 860),
    (844, 390),
    (480, 860),
    (520, 860),
    (390, 560),
    (390, 558),
    (390, 598),
    (390, 602),
    (390, 650),
    (390, 698),
    (390, 702),
    (640, 560),
]

MEASURE = """
() => {
  const img = document.querySelector('[data-static-portal] img');
  const actions = document.querySelector('.portal-actions');
  const copy = document.querySelector('.portal-copy');
  const dock = document.querySelector('[data-dock]');
  if (!img) return { ok: false, reason: 'no static portal' };
  const box = img.getBoundingClientRect();
  const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
  const scale = Math.min(box.width / nw, box.height / nh);
  const pw = nw * scale, ph = nh * scale;
  const painted = {
    left: box.left + (box.width - pw) / 2,
    top: box.top + (box.height - ph) / 2,
    right: box.left + (box.width + pw) / 2,
    bottom: box.top + (box.height + ph) / 2,
  };
  const r = (el) => el ? el.getBoundingClientRect().toJSON() : null;
  return {
    ok: true,
    painted,
    actions: actions ? Array.from(actions.children).map((c) => c.getBoundingClientRect().toJSON()) : [],
    copy: r(copy),
    dock: r(dock),
    viewport: { w: window.innerWidth, h: window.innerHeight },
    naturalRatio: nw / nh,
    paintedRatio: pw / ph,
  };
}
"""


def overlaps(a, b):
    if not a or not b:
        return False
    return not (
        a["right"] <= b["left"] + 0.5
        or a["left"] >= b["right"] - 0.5
        or a["bottom"] <= b["top"] + 0.5
        or a["top"] >= b["bottom"] - 0.5
    )


async def main():
    failures = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for mode in ("reduced-motion", "static-webgl-off"):
            args = ["--disable-webgl", "--disable-software-rasterizer"] if "webgl" in mode else []
            b = await p.chromium.launch(headless=True, args=args) if args else browser
            for w, h in SIZES:
                ctx = await b.new_context(
                    viewport={"width": w, "height": h},
                    reduced_motion="reduce" if mode == "reduced-motion" else "no-preference",
                )
                page = await ctx.new_page()
                await page.goto(BASE_URL, wait_until="domcontentloaded")
                await page.wait_for_selector("[data-static-portal]", timeout=15000, state="attached")
                await page.wait_for_timeout(900)
                m = await page.evaluate(MEASURE)
                name = f"{mode}-{w}x{h}"
                await page.screenshot(path=str(OUT / f"{name}.png"))
                problems = []
                if not m.get("ok"):
                    problems.append(m.get("reason"))
                else:
                    pa = m["painted"]
                    if any(overlaps(pa, rect) for rect in m["actions"]):
                        problems.append("emblem overlaps CTA")
                    if overlaps(pa, m["copy"]):
                        problems.append("emblem overlaps copy")
                    if overlaps(pa, m["dock"]):
                        problems.append("emblem overlaps dock")
                    if pa["top"] < -0.5 or pa["bottom"] > m["viewport"]["h"] + 0.5:
                        problems.append("emblem clipped vertically")
                    if pa["left"] < -0.5 or pa["right"] > m["viewport"]["w"] + 0.5:
                        problems.append("emblem clipped horizontally")
                    if min(pa["right"] - pa["left"], pa["bottom"] - pa["top"]) < 96:
                        problems.append("emblem area collapsed")
                    if abs(m["naturalRatio"] - m["paintedRatio"]) > 0.01:
                        problems.append("aspect ratio changed")
                status = "PASS" if not problems else "FAIL"
                print(f"{status} {name} {json.dumps(m.get('painted'))} {problems}")
                if problems:
                    failures.append((name, problems))
                await ctx.close()
            if b is not browser:
                await b.close()
        await browser.close()
    if failures:
        raise SystemExit(f"{len(failures)} placement failures: {failures}")
    print("Static placement matrix PASS")


asyncio.run(main())
