"""G1 — контролируемое сравнение исходных лицевых профилей и 3D-геометрии.

Метод: фронтальная ортографическая проекция построенной three-геометрии в ту же
систему координат SVG (общие anchors, единый масштаб SVG_TO_WORLD), наложение на
исходный `portal-front-profiles.svg` и измерение расхождений в единицах SVG.
Звенья не растягиваются независимо; геометрия не изменяется ради совпадения.
"""

import asyncio
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
from scipy import ndimage

BASE_URL = os.environ.get("PORTAL_BASE_URL", "http://localhost:8080")
OUT = Path("docs/sprint/screenshots/portal-stage-01-3")
OUT.mkdir(parents=True, exist_ok=True)

SCALE = 2  # px на единицу SVG
VIEW = (-24, -12, 424, 424)
BEVEL_SVG_UNITS = 0.012 / 0.01  # designConfig.material.bevel / SVG_TO_WORLD
W, H = VIEW[2] * SCALE, VIEW[3] * SCALE

RENDER_JS = r"""
async ({ scale, view }) => {
  const mod = await import('/src/lib/portal-geometry.ts');
  const [vx, vy, vw, vh] = view;
  const out = {};
  for (const spec of mod.portalLinks) {
    const geometry = mod.createPortalGeometry(spec);
    const canvas = document.createElement('canvas');
    canvas.width = vw * scale;
    canvas.height = vh * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    const pos = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index ? index.count : pos.count;
    const toPx = (i) => {
      const wx = pos.getX(i);
      const wy = pos.getY(i);
      // Обратное преобразование world -> SVG: те же anchors и тот же масштаб.
      const sx = wx / mod.SVG_TO_WORLD + spec.anchor[0];
      const sy = spec.anchor[1] - wy / mod.SVG_TO_WORLD;
      return [(sx - vx) * scale, (sy - vy) * scale];
    };
    for (let t = 0; t < count; t += 3) {
      const a = index ? index.getX(t) : t;
      const b = index ? index.getX(t + 1) : t + 1;
      const c = index ? index.getX(t + 2) : t + 2;
      const pa = toPx(a), pb = toPx(b), pc = toPx(c);
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.lineTo(pc[0], pc[1]);
      ctx.closePath();
      ctx.fill();
    }
    out[spec.id] = canvas.toDataURL('image/png');
  }
  return out;
}
"""

SOURCE_JS = r"""
async ({ scale, view, url }) => {
  const [vx, vy, vw, vh] = view;
  const text = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const out = {};
  for (const group of doc.querySelectorAll('g[id^="portal-link"]')) {
    const d = group.querySelector('path').getAttribute('d');
    const canvas = document.createElement('canvas');
    canvas.width = vw * scale;
    canvas.height = vh * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.setTransform(scale, 0, 0, scale, -vx * scale, -vy * scale);
    ctx.fill(new Path2D(d));
    out[group.id] = canvas.toDataURL('image/png');
  }
  return out;
}
"""


def mask(data_url: str) -> np.ndarray:
    import base64
    import io

    raw = base64.b64decode(data_url.split(",", 1)[1])
    image = Image.open(io.BytesIO(raw)).convert("L")
    return np.array(image) > 127


async def run():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await (await browser.new_context(viewport={"width": 900, "height": 700})).new_page()
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        projected = await page.evaluate(RENDER_JS, {"scale": SCALE, "view": list(VIEW)})
        source = await page.evaluate(
            SOURCE_JS,
            {
                "scale": SCALE,
                "view": list(VIEW),
                "url": "/brand/portal/portal-front-profiles.svg",
            },
        )
        await browser.close()

    overlay = np.zeros((H, W, 3), dtype=np.uint8)
    report = []
    ok = True
    for link_id in source:
        src = mask(source[link_id])
        proj = mask(projected[link_id])
        inter = np.logical_and(src, proj).sum()
        union = np.logical_or(src, proj).sum()
        iou = inter / max(1, union)
        # Максимальное расхождение контуров в единицах SVG.
        dist_to_src = ndimage.distance_transform_edt(~src)
        dist_to_proj = ndimage.distance_transform_edt(~proj)
        outside = dist_to_src[np.logical_and(proj, ~src)]
        missing = dist_to_proj[np.logical_and(src, ~proj)]
        max_outside = float(outside.max()) / SCALE if outside.size else 0.0
        max_missing = float(missing.max()) / SCALE if missing.size else 0.0
        entry = {
            "link": link_id,
            "iou": round(float(iou), 4),
            "maxOutsideSvgUnits": round(max_outside, 2),
            "maxMissingSvgUnits": round(max_missing, 2),
            "sourceAreaPx": int(src.sum()),
            "projectedAreaPx": int(proj.sum()),
        }
        report.append(entry)
        print(json.dumps(entry, ensure_ascii=False), flush=True)
        # Допуск: проекция не должна терять исходный контур (maxMissing≈0) и
        # может выходить наружу только на внешний bevel экструзии
        # (bevel = 0.012 world = 1.2 единицы SVG; на углах до sqrt(2)·bevel).
        if max_missing > 0.5 or max_outside > BEVEL_SVG_UNITS * 2:
            ok = False
        overlay[..., 2] |= (src * 255).astype(np.uint8)
        overlay[..., 1] |= (proj * 255).astype(np.uint8)

    Image.fromarray(overlay).save(OUT / "g1-overlay-source-vs-projection.png")
    (OUT / "g1-geometry-compare.json").write_text(
        json.dumps({"scale": SCALE, "viewBox": VIEW, "links": report}, ensure_ascii=False, indent=2)
    )
    print(
        json.dumps(
            {
                "name": "g1-summary",
                "overlay": str(OUT / "g1-overlay-source-vs-projection.png"),
                "note": (
                    "Расхождение наружу соответствует bevel экструзии; "
                    "художественная перспектива, глубина и нарисованные боковые грани "
                    "master SVG в это сравнение не входят."
                ),
                "pass": ok,
            },
            ensure_ascii=False,
        )
    )
    assert ok, "G1: расхождение профилей выше допуска"


asyncio.run(run())
