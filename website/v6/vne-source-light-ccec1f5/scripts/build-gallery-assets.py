#!/usr/bin/env python3
"""Сборка официальной библиотеки VNE Gallery of Light v1 (промпт 02).

Вход: исходники в asset_log/official/gallery-of-light/v1/source/.
Выход: производные в public/media/gallery-of-light/v1/, иконки и OG в public/,
контрольные PNG бренда в asset_log/official/brand-renders/, реестр asset-manifest.json.
Никакой генерации: только resize, encode, rasterize и композитинг существующих файлов.
"""
from __future__ import annotations

import hashlib
import io
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageCms

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "asset_log/official/gallery-of-light/v1/source"
OUT = ROOT / "public/media/gallery-of-light/v1"
BRAND_OUT = ROOT / "asset_log/official/brand-renders"
PUBLIC = ROOT / "public"
PORTAL = PUBLIC / "brand/portal/portal-master.svg"
FLOW = PUBLIC / "brand/wordmark/wordmark-flow-light.svg"
BG = (7, 10, 9)

CHAPTERS = ["hero", "space", "belonging", "invitation"]
WIDTHS = {"desktop": [1280, 1920, 2560], "mobile": [480, 768, 1080]}
# Оценочные точки фокуса (доля ширины/высоты), выбраны по просмотру кадров.
FOCAL = {
    ("hero", "desktop"): (0.5, 0.55), ("hero", "mobile"): (0.5, 0.62),
    ("space", "desktop"): (0.5, 0.5), ("space", "mobile"): (0.5, 0.5),
    ("belonging", "desktop"): (0.5, 0.5), ("belonging", "mobile"): (0.5, 0.55),
    ("invitation", "desktop"): (0.5, 0.5), ("invitation", "mobile"): (0.5, 0.55),
}
# Используемый на сайте кадр. hero mobile — PNG v2, переданный владельцем 24.09.2026.
SELECTED = {(c, v): f"gallery-{c}-{v}-v1.png" for c in CHAPTERS for v in WIDTHS}
SELECTED[("hero", "mobile")] = "gallery-hero-mobile-v2.png"
CANDIDATES = ["gallery-hero-mobile-v1.png"]


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def git_commit() -> str:
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def to_srgb(im: Image.Image) -> Image.Image:
    icc = im.info.get("icc_profile")
    if icc:
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        im = ImageCms.profileToProfile(im, src, ImageCms.createProfile("sRGB"), outputMode="RGB")
    return im.convert("RGB")


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def build_gallery(manifest: list) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for (chapter, variant), name in SELECTED.items():
        src = SRC / name
        ver = "v2" if "-v2." in name else "v1"
        im = to_srgb(Image.open(src))
        w, h = im.size
        widths = sorted({min(x, w) for x in WIDTHS[variant]})
        derivatives = []
        for width in widths:
            height = round(h * width / w)
            frame = im if width == w else im.resize((width, height), Image.LANCZOS)
            for fmt, opts in (("avif", {"quality": 60, "speed": 6}), ("webp", {"quality": 82, "method": 6})):
                path = OUT / f"gallery-{chapter}-{variant}-{ver}-{width}.{fmt}"
                frame.save(path, fmt.upper(), **opts)
                derivatives.append({"path": rel(path), "url": "/" + path.relative_to(PUBLIC).as_posix(),
                                    "format": fmt, "width": width, "height": height,
                                    "bytes": path.stat().st_size, "sha256": sha(path)})
        manifest.append({
            "id": f"gallery-{chapter}-{variant}", "version": ver, "category": "background",
            "status": "in-use", "chapter": chapter, "variant": variant,
            "sourcePath": rel(src), "sourceHash": sha(src), "sourceWidth": w, "sourceHeight": h,
            "sourceNote": "обновлённый PNG v2, переданный владельцем 24.09.2026" if name == "gallery-hero-mobile-v2.png" else None,
            "aspectRatio": round(w / h, 4), "focalPoint": {"x": FOCAL[(chapter, variant)][0], "y": FOCAL[(chapter, variant)][1], "estimated": True},
            "role": "decorative", "alt": "", "provenance": "VNE Gallery of Light, передано владельцем",
            "approvedBy": None, "approvedAt": None, "derivatives": derivatives,
        })
    for name in CANDIDATES:
        src = SRC / name
        im = Image.open(src)
        manifest.append({"id": name.removesuffix(".png"), "version": "v1", "category": "background",
                         "status": "candidate", "sourcePath": rel(src), "sourceHash": sha(src),
                         "sourceWidth": im.width, "sourceHeight": im.height, "role": "decorative",
                         "note": "кадр из набора FIN; на сайте остаётся исправленная v2 до решения владельца",
                         "approvedBy": None, "approvedAt": None, "derivatives": []})


def svg_png(svg: Path, width: int | None = None, height: int | None = None) -> Image.Image:
    cmd = ["rsvg-convert", str(svg)]
    if width:
        cmd += ["-w", str(width)]
    if height:
        cmd += ["-h", str(height)]
    if width and height:
        cmd += ["--keep-aspect-ratio"]
    return Image.open(io.BytesIO(subprocess.run(cmd, check=True, capture_output=True).stdout)).convert("RGBA")


def square(mark: Image.Image, size: int, bg=None, pad=0.08) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    inner = int(size * (1 - 2 * pad))
    m = mark.copy()
    m.thumbnail((inner, inner), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas


def build_brand(manifest: list) -> None:
    BRAND_OUT.mkdir(parents=True, exist_ok=True)
    portal = svg_png(PORTAL, width=1024)
    flow = svg_png(FLOW, width=1600)
    for label, img in (("portal", portal), ("flow", flow)):
        for bgname, bg in (("transparent", None), ("black", BG), ("light", (237, 242, 238))):
            c = Image.new("RGBA", img.size, bg + (255,) if bg else (0, 0, 0, 0))
            c.alpha_composite(img)
            c.save(BRAND_OUT / f"{label}-{bgname}.png")
    outputs = []
    ico_src = square(portal, 256, BG, pad=0.06)
    ico = PUBLIC / "favicon.ico"
    ico_src.save(ico, sizes=[(16, 16), (32, 32), (48, 48)])
    outputs.append(ico)
    for name, size in (("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)):
        p = PUBLIC / name
        square(portal, size, BG, pad=0.1).convert("RGB").save(p, optimize=True)
        outputs.append(p)
    svg_icon = PUBLIC / "icon.svg"
    svg_icon.write_bytes(PORTAL.read_bytes())
    outputs.append(svg_icon)
    for s in (16, 32, 48):
        square(portal, s, BG, pad=0.06).save(BRAND_OUT / f"favicon-check-{s}.png")
    # OG 1200×630: фон hero desktop + точный Flow SVG, без текста из нейросети.
    og = to_srgb(Image.open(SRC / SELECTED[("hero", "desktop")]))
    scale = max(1200 / og.width, 630 / og.height)
    og = og.resize((round(og.width * scale), round(og.height * scale)), Image.LANCZOS)
    left, top = (og.width - 1200) // 2, (og.height - 630) // 2
    og = og.crop((left, top, left + 1200, top + 630)).convert("RGBA")
    shade = Image.new("RGBA", og.size, BG + (110,))
    og.alpha_composite(shade)
    mark = flow.copy()
    mark.thumbnail((560, 240), Image.LANCZOS)
    og.alpha_composite(mark, ((1200 - mark.width) // 2, (630 - mark.height) // 2))
    ogp = PUBLIC / "og-cover.jpg"
    og.convert("RGB").save(ogp, quality=86, optimize=True)
    outputs.append(ogp)
    for p in outputs:
        im = Image.open(p) if p.suffix != ".svg" else None
        manifest.append({"id": p.stem, "version": "v1", "category": "brand-derivative", "status": "in-use",
                         "sourcePath": rel(PORTAL if p.name != "og-cover.jpg" else FLOW),
                         "sourceHash": sha(PORTAL if p.name != "og-cover.jpg" else FLOW),
                         "path": rel(p), "width": im.width if im else None, "height": im.height if im else None,
                         "bytes": p.stat().st_size, "sha256": sha(p), "role": "content",
                         "approvedBy": None, "approvedAt": None})


def brand_inventory() -> list:
    items = []
    paths = sorted([*(PUBLIC / "brand").rglob("*"), *(PUBLIC / "fonts").rglob("*"),
                    ROOT / "src/config/design-config.ts", ROOT / "src/config/motion-config.ts",
                    ROOT / "src/lib/portal-geometry.ts"])
    for p in paths:
        if p.is_file():
            blob = subprocess.run(["git", "hash-object", str(p)], capture_output=True, text=True).stdout.strip()
            items.append({"path": rel(p), "gitBlob": blob, "sha256": sha(p), "bytes": p.stat().st_size})
    return items


def main() -> None:
    manifest: list = []
    build_gallery(manifest)
    build_brand(manifest)
    doc = {"library": "VNE Gallery of Light", "version": "v1", "sourceCommit": git_commit(),
           "notes": ["AVIF и WebP; JPEG fallback не требуется (WebP — базовый формат).",
                     "Исходники 1672×941 / 941×1672: ширины 1920/2560 и 1080 ограничены реальным разрешением, апскейла нет."],
           "brandInventory": brand_inventory(), "assets": manifest}
    (ROOT / "asset_log/official/gallery-of-light/v1/asset-manifest.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    print("ok", len(manifest))


if __name__ == "__main__":
    main()
