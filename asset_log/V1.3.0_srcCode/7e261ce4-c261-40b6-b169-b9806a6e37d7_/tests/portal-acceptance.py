"""ВНЕ / ПОРОГ — единый acceptance harness первого экрана.

Запуск:  bun run test:acceptance
Smoke на собранном приложении:  PORTAL_SMOKE=1 PORTAL_BASE_URL=... python3 tests/portal-acceptance.py
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright
from PIL import Image

BASE_URL = os.environ.get("PORTAL_BASE_URL", "http://localhost:8080")
SMOKE = os.environ.get("PORTAL_SMOKE") == "1"
OUTPUT = Path(
    os.environ.get("PORTAL_AUDIT_OUTPUT", "docs/sprint/screenshots/portal-stage-01-3")
)
OUTPUT.mkdir(parents=True, exist_ok=True)

STARTED_AT = time.strftime("%Y-%m-%dT%H:%M:%S%z")
RESULTS: list[dict] = []
SCENE_DEP_HINTS = ("three", "fiber", "drei")


def log(payload: dict):
    print(json.dumps(payload, ensure_ascii=False), flush=True)
    RESULTS.append(payload)


STATE_JS = r"""(name) => {
  const section = document.querySelector('#threshold');
  const canvas = document.querySelector('canvas');
  let renderer = null;
  if (canvas) {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
    }
  }
  const progressNode = [...document.querySelectorAll('div')]
    .find((node) => /^СБОРКА \d+$/.test(node.textContent || ''));
  const progress = progressNode?.textContent || null;
  const displayed = progress ? Number(progress.replace('СБОРКА ', '')) : null;
  const sectionRect = section?.getBoundingClientRect();
  const distance = section ? section.offsetHeight - innerHeight : 0;
  const raw = distance > 0 ? Math.min(1, Math.max(0, scrollY / distance)) : 0;
  return {
    name,
    viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    scrollY,
    scrollDistance: distance,
    rawProgress: Number(raw.toFixed(4)),
    displayedProgress: displayed,
    mode: section?.getAttribute('data-mode') || null,
    canvas: document.querySelectorAll('canvas').length,
    staticSvg: document.querySelectorAll('[data-static-portal]').length,
    loading: document.querySelectorAll('[data-portal-loading]').length,
    progress,
    renderer,
    sectionTop: sectionRect ? Math.round(sectionRect.top) : null,
  };
}"""

COMPOSITION_JS = r"""() => {
  const rect = (element) => {
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const actions = document.querySelector('.portal-actions');
  return {
    viewport: { width: innerWidth, height: innerHeight },
    wordmark: rect(document.querySelector('.portal-copy img')),
    actions: actions ? [...actions.children].map((child) => rect(child)) : [],
    dock: rect(document.querySelector('[data-dock]')),
    canvas: rect(document.querySelector('canvas')),
    staticSvg: rect(document.querySelector('[data-static-portal] img')),
  };
}"""


async def state(page, name: str, shot: bool = True):
    result = await page.evaluate(STATE_JS, name)
    log(result)
    if shot:
        await page.screenshot(path=str(OUTPUT / f"{name}.png"))
    return result


def intersects(a, b, slack=1.0):
    return (
        a["left"] < b["right"] - slack
        and a["right"] > b["left"] + slack
        and a["top"] < b["bottom"] - slack
        and a["bottom"] > b["top"] + slack
    )


def inside(rect, viewport, slack=1.0):
    return (
        rect["left"] >= -slack
        and rect["top"] >= -slack
        and rect["right"] <= viewport["width"] + slack
        and rect["bottom"] <= viewport["height"] + slack
    )


async def composition(page, name: str):
    data = await page.evaluate(COMPOSITION_JS)
    viewport = data["viewport"]
    problems = []
    if not data["wordmark"] or not inside(data["wordmark"], viewport, 2):
        problems.append("wordmark clipped or missing")
    if not data["actions"]:
        problems.append("actions missing")
    for control in data["actions"]:
        if not inside(control, viewport, 2):
            problems.append("cta clipped")
        if data["dock"] and intersects(control, data["dock"]):
            problems.append("cta overlaps dock")
    if not data["dock"] or not inside(data["dock"], viewport, 2):
        problems.append("dock clipped or missing")
    log({"name": f"{name}-composition", **data, "problems": problems})
    assert not problems, (name, problems)


async def wait_ready(page, timeout: int = 15_000):
    await page.wait_for_selector("canvas", state="visible", timeout=timeout)
    await page.wait_for_function(
        "document.querySelector('[data-portal-loading]') === null", timeout=timeout
    )


async def wait_progress(page, expected: int, timeout: int = 12_000):
    await page.wait_for_function(
        """(expected) => [...document.querySelectorAll('div')]
          .some((node) => node.textContent === `СБОРКА ${String(expected).padStart(2, '0')}`)""",
        arg=expected,
        timeout=timeout,
    )


async def canvas_evidence(page, name: str, min_colors: int = 64):
    path = OUTPUT / f"{name}-canvas.png"
    await page.locator("canvas").screenshot(path=str(path))
    image = Image.open(path).convert("RGB")
    colors = image.getcolors(maxcolors=image.width * image.height) or []
    unique_colors = len(colors)
    non_dark = sum(count for count, color in colors if max(color) > 45)
    log({"name": f"{name}-pixels", "uniqueColors": unique_colors, "nonDarkPixels": non_dark})
    assert unique_colors > min_colors and non_dark > 500, (name, unique_colors, non_dark)


def is_scene_module(url: str) -> bool:
    """Модуль самой сцены, но не его loader-обёртка."""
    base = url.split("?")[0]
    return "PortalSceneLoader" not in base and (
        base.endswith("/PortalScene.tsx") or "/PortalScene-" in base
    )


def scene_request(url: str) -> bool:
    """Запрос самой сцены или её 3D-зависимостей (dev и собранные chunk-имена),
    но не loader-обёртки."""
    base = url.split("?")[0]
    if "PortalSceneLoader" in base:
        return False
    return is_scene_module(base) or any(hint in base for hint in SCENE_DEP_HINTS)


async def wait_for_interception(page, intercepted: list, timeout_ms: int = 15_000):
    waited = 0
    while not intercepted and waited < timeout_ms:
        await page.wait_for_timeout(200)
        waited += 200
    assert intercepted, "перехват модуля сцены не сработал"


async def gated_scene_route(page, gate: asyncio.Event, aborted: list):
    """Задерживает загрузку модуля сцены до открытия gate."""

    async def handler(route):
        url = route.request.url
        if is_scene_module(url):
            aborted.append(url)
            await gate.wait()
        await route.continue_()

    await page.route("**/*", handler)


# ---------------------------------------------------------------- сценарии


async def scenario_loading_and_ready(browser):
    context = await browser.new_context(viewport={"width": 1440, "height": 900})
    page = await context.new_page()
    gate = asyncio.Event()
    intercepted: list[str] = []
    await gated_scene_route(page, gate, intercepted)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.wait_for_selector("[data-portal-loading]", timeout=10_000)
    await wait_for_interception(page, intercepted)
    loading = await state(page, "01-loading")
    assert loading["loading"] == 1 and loading["staticSvg"] == 0 and loading["canvas"] == 0
    assert intercepted, "перехват модуля сцены не сработал"
    gate.set()
    await wait_ready(page)
    zero = await state(page, "02-ready-zero")
    assert zero["canvas"] == 1 and zero["staticSvg"] == 0 and zero["displayedProgress"] == 0
    await canvas_evidence(page, "02-ready-zero")
    await composition(page, "02-ready-zero")
    await context.close()


async def scenario_desktop_scroll(browser):
    context = await browser.new_context(viewport={"width": 1440, "height": 900})
    page = await context.new_page()
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await wait_ready(page)
    distance = await page.locator("#threshold").evaluate(
        "element => element.offsetHeight - innerHeight"
    )
    for label, ratio in [("03-first", 0.03), ("04-mid", 0.55), ("05-hold", 1.0)]:
        await page.evaluate("y => scrollTo(0, y)", distance * ratio)
        if ratio == 1.0:
            await wait_progress(page, 100)
        else:
            await page.wait_for_timeout(1_500)
        current = await state(page, label)
        assert current["canvas"] == 1
        await canvas_evidence(page, label)
    await page.evaluate("() => scrollTo(0, 0)")
    await wait_progress(page, 0)
    reverse = await state(page, "06-reverse-zero")
    assert reverse["displayedProgress"] == 0
    await canvas_evidence(page, "06-reverse-zero")

    # Диалог: Escape, полный цикл Tab/Shift+Tab, возврат фокуса.
    trigger = page.get_by_role("button", name="Получить приглашение").last
    await trigger.focus()
    await trigger.press("Enter")
    dialog = page.get_by_role("dialog")
    await dialog.wait_for(state="visible")
    seen = []
    for _ in range(12):
        await page.keyboard.press("Tab")
        seen.append(await page.evaluate("() => document.activeElement?.outerHTML?.slice(0, 60)"))
        assert await page.evaluate(
            "() => document.querySelector('[role=dialog]')?.contains(document.activeElement)"
        ), "фокус вышел из диалога при Tab"
    for _ in range(12):
        await page.keyboard.press("Shift+Tab")
        assert await page.evaluate(
            "() => document.querySelector('[role=dialog]')?.contains(document.activeElement)"
        ), "фокус вышел из диалога при Shift+Tab"
    log({"name": "dialog-focus-cycle", "tabStops": len(set(seen))})
    assert len(set(seen)) > 1
    await page.keyboard.press("Escape")
    await dialog.wait_for(state="hidden")
    assert await trigger.evaluate("element => element === document.activeElement")
    await context.close()


async def scenario_mobile(browser, width: int, height: int, prefix: str):
    context = await browser.new_context(viewport={"width": width, "height": height})
    page = await context.new_page()
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await wait_ready(page)
    distance = await page.locator("#threshold").evaluate(
        "element => element.offsetHeight - innerHeight"
    )
    for label, ratio in [("reveal", 0.12), ("mid", 0.55), ("assembled", 1.0)]:
        await page.evaluate("y => scrollTo(0, y)", distance * ratio)
        if ratio == 1.0:
            await wait_progress(page, 100)
        else:
            await page.wait_for_timeout(1_500)
        current = await state(page, f"{prefix}-{label}")
        assert current["canvas"] == 1
        await canvas_evidence(page, f"{prefix}-{label}")
        await composition(page, f"{prefix}-{label}")
    await page.evaluate("() => scrollTo(0, 0)")
    await wait_progress(page, 0)
    back = await state(page, f"{prefix}-reverse")
    assert back["displayedProgress"] == 0
    await composition(page, f"{prefix}-reverse")
    await context.close()


async def scenario_landscape(browser):
    context = await browser.new_context(viewport={"width": 844, "height": 390})
    page = await context.new_page()
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await wait_ready(page)
    distance = await page.locator("#threshold").evaluate(
        "element => element.offsetHeight - innerHeight"
    )
    await page.evaluate("y => scrollTo(0, y)", distance * 0.55)
    await page.wait_for_timeout(1_200)
    landscape = await state(page, "09-landscape-mid")
    assert landscape["canvas"] == 1
    await canvas_evidence(page, "09-landscape-mid")
    await composition(page, "09-landscape-mid")
    await context.close()


async def scenario_module_reject(browser):
    context = await browser.new_context(viewport={"width": 1280, "height": 720})
    page = await context.new_page()

    async def reject(route):
        if is_scene_module(route.request.url):
            await route.abort()
        else:
            await route.continue_()

    await page.route("**/*", reject)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.wait_for_selector("[data-static-portal]", timeout=8_000)
    rejected = await state(page, "10-module-reject-static")
    assert rejected["mode"] == "static" and rejected["canvas"] == 0
    assert await page.get_by_role("button", name="Получить приглашение").last.is_visible()
    await context.close()


async def scenario_reload_and_context_loss(browser):
    context = await browser.new_context(viewport={"width": 1280, "height": 720})
    page = await context.new_page()
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await wait_ready(page)

    # Ранняя прокрутка во время загрузки сцены проверяется отдельным заходом ниже.
    distance = await page.locator("#threshold").evaluate(
        "element => element.offsetHeight - innerHeight"
    )
    await page.evaluate("y => scrollTo(0, y)", distance * 0.6)
    await wait_progress(page, 60)
    before = await state(page, "11a-before-reload")
    await page.reload(wait_until="domcontentloaded")
    await wait_ready(page)
    await page.wait_for_timeout(1_500)
    after = await state(page, "11-reload-restored")
    assert abs(after["rawProgress"] - before["rawProgress"]) < 0.03, (
        before["rawProgress"],
        after["rawProgress"],
    )
    assert after["displayedProgress"] is not None
    assert abs(after["displayedProgress"] - before["displayedProgress"]) <= 2
    await canvas_evidence(page, "11-reload-restored")

    # Back / Forward
    await page.evaluate("() => scrollTo(0, 0)")
    await wait_progress(page, 0)
    await page.locator("#night").scroll_into_view_if_needed()
    await page.wait_for_timeout(400)
    await page.go_back(wait_until="domcontentloaded")
    await page.wait_for_timeout(800)
    await page.go_forward(wait_until="domcontentloaded")
    await page.wait_for_timeout(800)
    nav = await state(page, "11b-history-navigation")
    assert nav["mode"] in ("interactive", "static")

    await page.evaluate("y => scrollTo(0, y)", distance * 0.4)
    await page.wait_for_timeout(800)
    canvas = page.locator("canvas")
    await canvas.evaluate(
        """element => {
          const gl = element.getContext('webgl2') || element.getContext('webgl');
          gl?.getExtension('WEBGL_lose_context')?.loseContext();
        }"""
    )
    await page.wait_for_selector("[data-static-portal]", timeout=8_000)
    lost = await state(page, "12-context-lost-static")
    assert lost["mode"] == "static" and lost["canvas"] == 0
    await page.wait_for_timeout(2_000)
    assert await page.locator("canvas").count() == 0
    await context.close()


async def scenario_early_scroll(browser):
    context = await browser.new_context(viewport={"width": 1280, "height": 720})
    page = await context.new_page()
    gate = asyncio.Event()
    intercepted: list[str] = []
    await gated_scene_route(page, gate, intercepted)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.wait_for_selector("[data-portal-loading]", timeout=10_000)
    await wait_for_interception(page, intercepted)
    distance = await page.locator("#threshold").evaluate(
        "element => element.offsetHeight - innerHeight"
    )
    await page.evaluate("y => scrollTo(0, y)", distance * 0.5)
    await page.wait_for_timeout(600)
    during = await state(page, "17-early-scroll-loading")
    assert during["loading"] == 1 and during["staticSvg"] == 0
    gate.set()
    await wait_ready(page)
    await page.wait_for_timeout(1_500)
    resolved = await state(page, "18-early-scroll-ready")
    assert resolved["canvas"] == 1
    assert abs(resolved["rawProgress"] - during["rawProgress"]) < 0.03
    assert resolved["displayedProgress"] is not None and resolved["displayedProgress"] > 30
    await canvas_evidence(page, "18-early-scroll-ready")
    await context.close()


async def scenario_module_timeout(browser):
    """8 секунд активного времени: пауза при диалоге, затем terminal static
    и подтверждённое позднее завершение импорта."""
    context = await browser.new_context(viewport={"width": 1280, "height": 720})
    page = await context.new_page()
    gate = asyncio.Event()
    intercepted: list[str] = []
    finished: list[str] = []
    page.on(
        "requestfinished",
        lambda request: finished.append(request.url) if is_scene_module(request.url) else None,
    )
    await gated_scene_route(page, gate, intercepted)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await wait_for_interception(page, intercepted)
    await page.get_by_role("button", name="Получить приглашение").last.click()
    await page.get_by_role("dialog").wait_for(state="visible")
    await page.wait_for_timeout(9_000)
    paused = await state(page, "13-module-timeout-paused")
    assert paused["loading"] == 1 and paused["staticSvg"] == 0, "таймер импорта не встал на паузу"
    assert intercepted, "перехват модуля сцены не сработал"
    await page.keyboard.press("Escape")
    await page.wait_for_selector("[data-static-portal]", timeout=12_000)
    timed_out = await state(page, "14-module-timeout-static")
    assert timed_out["mode"] == "static" and timed_out["canvas"] == 0

    # Явное завершение импорта уже после terminal static.
    gate.set()
    for _ in range(50):
        if finished:
            break
        await page.wait_for_timeout(200)
    assert finished, "модуль сцены так и не завершил загрузку"
    await page.wait_for_timeout(2_500)
    late = await state(page, "19-late-import-after-static")
    assert late["canvas"] == 0 and late["loading"] == 0 and late["staticSvg"] == 1
    trigger = page.get_by_role("button", name="Получить приглашение").last
    await trigger.click()
    await page.get_by_role("dialog").wait_for(state="visible")
    await page.keyboard.press("Escape")
    await page.get_by_role("dialog").wait_for(state="hidden")
    log({"name": "19-late-import-after-static", "moduleFinished": finished[:1], "ctaWorks": True})
    await context.close()


async def scenario_resize_matrix(browser):
    context = await browser.new_context(viewport={"width": 1440, "height": 900})
    page = await context.new_page()
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await wait_ready(page)
    distance = await page.locator("#threshold").evaluate(
        "element => element.offsetHeight - innerHeight"
    )

    async def landmark(anchor: str):
        box = await page.locator(anchor).first.bounding_box()
        return None if box is None else {"anchor": anchor, "y": round(box["y"], 1)}

    # 1. resize внутри портала — прогресс сохраняется по доле секции.
    await page.evaluate("y => scrollTo(0, y)", distance * 0.5)
    await page.wait_for_timeout(1_200)
    before = await state(page, "20a-resize-inside-before", shot=False)
    await page.set_viewport_size({"width": 1180, "height": 780})
    await page.wait_for_timeout(900)
    after = await state(page, "20-resize-inside")
    assert abs(after["rawProgress"] - before["rawProgress"]) < 0.06, (
        before["rawProgress"],
        after["rawProgress"],
    )

    # 2. resize ниже портала — сохраняется место чтения.
    await page.locator("#night").scroll_into_view_if_needed()
    await page.wait_for_timeout(400)
    mark_before = await landmark("#night p")
    state_before = await state(page, "21a-resize-below-before", shot=False)
    await page.set_viewport_size({"width": 1180, "height": 640})
    await page.wait_for_timeout(700)
    mark_after = await landmark("#night p")
    state_after = await state(page, "21-resize-below")
    max_scroll = await page.evaluate("() => document.body.scrollHeight - innerHeight")
    log(
        {
            "name": "21-resize-below-landmark",
            "before": {**mark_before, "scrollY": state_before["scrollY"]},
            "after": {**mark_after, "scrollY": state_after["scrollY"]},
            "maxScroll": max_scroll,
        }
    )
    # Логическое место чтения сохраняется (постоянное смещение от конца
    # портала), либо мы упёрлись в максимум прокрутки.
    assert mark_after and mark_before
    assert (
        abs(mark_after["y"] - mark_before["y"]) < 120
        or abs(state_after["scrollY"] - max_scroll) < 4
    )

    # 3. resize при открытом диалоге.
    await page.evaluate("y => scrollTo(0, y)", distance * 0.5)
    await page.wait_for_timeout(900)
    dialog_before = await state(page, "22a-resize-dialog-before", shot=False)
    await page.get_by_role("button", name="Получить приглашение").last.click()
    await page.get_by_role("dialog").wait_for(state="visible")
    await page.set_viewport_size({"width": 900, "height": 820})
    await page.wait_for_timeout(700)
    dialog_state = await state(page, "22-resize-dialog-open")
    assert await page.get_by_role("dialog").is_visible()
    # При открытом диалоге позиция не пересчитывается намеренно: браузерная
    # позиция сохраняется, техническая коррекция не дёргает страницу.
    assert dialog_state["scrollY"] == dialog_before["scrollY"]
    await page.keyboard.press("Escape")
    await page.get_by_role("dialog").wait_for(state="hidden")

    # 4. переход в fallback во время чтения ниже портала.
    await page.locator("#night").scroll_into_view_if_needed()
    await page.wait_for_timeout(400)
    read_before = await landmark("#night p")
    await page.locator("canvas").evaluate(
        """element => {
          const gl = element.getContext('webgl2') || element.getContext('webgl');
          gl?.getExtension('WEBGL_lose_context')?.loseContext();
        }"""
    )
    await page.wait_for_selector("[data-static-portal]", timeout=8_000)
    await page.wait_for_timeout(600)
    read_after = await landmark("#night p")
    fallback_state = await state(page, "23-fallback-while-reading-below")
    log({"name": "23-landmark", "before": read_before, "after": read_after})
    assert fallback_state["mode"] == "static"
    assert read_after and 0 <= read_after["y"] < fallback_state["viewport"][1]
    await context.close()

    # 5. resize в static-режиме.
    context = await browser.new_context(viewport={"width": 500, "height": 860})
    page = await context.new_page()
    await page.emulate_media(reduced_motion="reduce")
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.wait_for_selector("[data-static-portal]", timeout=8_000)
    await page.set_viewport_size({"width": 390, "height": 844})
    await page.wait_for_timeout(700)
    static_resized = await state(page, "24-resize-static")
    assert static_resized["mode"] == "static" and static_resized["staticSvg"] == 1
    await composition(page, "24-resize-static")
    await context.close()


async def scenario_reduced_motion(browser):
    context = await browser.new_context(
        viewport={"width": 390, "height": 844}, reduced_motion="reduce"
    )
    page = await context.new_page()
    scene_requests: list[str] = []
    page.on(
        "request",
        lambda request: scene_requests.append(request.url) if scene_request(request.url) else None,
    )
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.wait_for_selector("[data-static-portal]", timeout=8_000)
    await page.wait_for_timeout(2_500)
    reduced = await state(page, "08-reduced-motion")
    assert reduced["mode"] == "static" and reduced["canvas"] == 0
    log({"name": "08-reduced-motion-requests", "sceneRequests": scene_requests})
    assert not scene_requests, scene_requests
    await composition(page, "08-reduced-motion")

    await page.emulate_media(reduced_motion="no-preference")
    await wait_ready(page)
    switched = await state(page, "25-reduced-motion-off")
    assert switched["mode"] == "interactive" and switched["canvas"] == 1
    assert scene_requests, "после отключения reduced motion сцена так и не запрошена"
    await page.emulate_media(reduced_motion="reduce")
    await page.wait_for_selector("[data-static-portal]", timeout=8_000)
    back = await state(page, "26-reduced-motion-on-again")
    assert back["mode"] == "static" and back["canvas"] == 0
    await context.close()


async def scenario_fonts(browser):
    context = await browser.new_context(viewport={"width": 1280, "height": 720})
    page = await context.new_page()
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.evaluate(
        """async () => {
          await document.fonts.load('400 20px Onest', 'Ёжик, йод, Ж, Д, Л');
          await document.fonts.load('400 20px Unbounded', 'Ёжик, йод, Ж, Д, Л');
        }"""
    )
    fonts = await page.evaluate(
        r"""() => {
          const sample = 'Ёжик йод Ж Д Л ВНЕ 2026';
          const measure = (family) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = `400 32px ${family}`;
            const m = ctx.measureText(sample);
            return Number(m.width.toFixed(2));
          };
          const glyphs = (family) => {
            const canvas = document.createElement('canvas');
            canvas.width = 420; canvas.height = 60;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.font = `400 32px ${family}`;
            ctx.fillText(sample, 4, 40);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let ink = 0;
            for (let i = 3; i < data.length; i += 4) if (data[i] > 24) ink += 1;
            return ink;
          };
          return {
            status: document.fonts.status,
            onestLoaded: document.fonts.check('400 20px Onest', 'Ёжик, йод, Ж, Д, Л'),
            unboundedLoaded: document.fonts.check('400 20px Unbounded', 'Ёжик, йод, Ж, Д, Л'),
            body: getComputedStyle(document.body).fontFamily,
            display: getComputedStyle(document.querySelector('#threshold p')).fontFamily,
            widthOnest: measure('Onest'),
            widthUnbounded: measure('Unbounded'),
            widthFallback: measure('monospace'),
            inkOnest: glyphs('Onest'),
            inkUnbounded: glyphs('Unbounded'),
            inkFallback: glyphs('monospace'),
          };
        }"""
    )
    log({"name": "15-fonts", **fonts})
    assert fonts["status"] == "loaded"
    assert fonts["onestLoaded"] and fonts["unboundedLoaded"]
    assert "Onest" in fonts["body"] and "Unbounded" in fonts["display"]
    # Реальное использование шрифта: метрики отличаются от fallback и друг от друга.
    assert fonts["widthOnest"] != fonts["widthFallback"]
    assert fonts["widthUnbounded"] != fonts["widthFallback"]
    assert fonts["widthOnest"] != fonts["widthUnbounded"]
    assert fonts["inkOnest"] > 500 and fonts["inkUnbounded"] > 500
    assert fonts["inkOnest"] != fonts["inkFallback"]
    await context.close()


async def scenario_no_webgl(playwright):
    no_webgl_browser = await playwright.chromium.launch(
        headless=True, args=["--disable-webgl", "--disable-software-rasterizer"]
    )
    context = await no_webgl_browser.new_context(viewport={"width": 1280, "height": 720})
    page = await context.new_page()
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.wait_for_selector("[data-static-portal]", timeout=10_000)
    no_webgl = await state(page, "16-webgl-unavailable-static")
    assert no_webgl["mode"] == "static" and no_webgl["canvas"] == 0
    await composition(page, "16-webgl-unavailable-static")
    await no_webgl_browser.close()


async def run():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        log({"name": "00-run", "baseUrl": BASE_URL, "startedAt": STARTED_AT, "smoke": SMOKE})

        await scenario_loading_and_ready(browser)
        await scenario_module_reject(browser)
        await scenario_reduced_motion(browser)
        if not SMOKE:
            await scenario_desktop_scroll(browser)
            await scenario_mobile(browser, 390, 844, "27-mobile-390x844")
            await scenario_mobile(browser, 360, 740, "28-mobile-360x740")
            await scenario_landscape(browser)
            await scenario_reload_and_context_loss(browser)
            await scenario_early_scroll(browser)
            await scenario_module_timeout(browser)
            await scenario_resize_matrix(browser)
            await scenario_fonts(browser)
        await browser.close()
        await scenario_no_webgl(playwright)

        log(
            {
                "name": "99-summary",
                "scenarios": len(RESULTS),
                "notVerified": [
                    "renderer 4s timeout: успешный импорт без пригодного кадра "
                    "недостижим в headless Chromium без публичного переключателя отказа",
                    "физические iPhone/Safari, Android/Chrome, GPU и экран 120 Гц",
                ],
            }
        )
        print("Acceptance harness PASS", file=sys.stdout, flush=True)


asyncio.run(run())
