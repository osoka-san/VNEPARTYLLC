import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

BASE="http://localhost:8080"
OUT=Path("docs/sprint/screenshots/day-03")
OUT.mkdir(parents=True, exist_ok=True)
ROUTES=["/events","/events/light-study-01","/events/missing","/apply","/apply?event=light-study-01","/apply?event=missing","/about#space","/about#community","/rules","/faq#access","/contact","/privacy","/consent","/terms","/refunds","/cookies","/member","/admin","/scan","/i/demo","/c/demo","/missing-page"]

async def main():
  results=[]
  async with async_playwright() as p:
    browser=await p.chromium.launch(headless=True)
    context=await browser.new_context(viewport={"width":1280,"height":1800})
    page=await context.new_page()
    errors=[]
    page.on("pageerror", lambda error: errors.append(str(error)))
    for route in ROUTES:
      response=await page.goto(BASE+route, wait_until="networkidle")
      text=(await page.locator("body").inner_text())[:300]
      canvas=await page.locator("canvas").count()
      results.append({"route":route,"status":response.status if response else None,"title":await page.title(),"canvas":canvas,"text":text})
      assert response is None or response.status < 500, route
      if route != "/": assert canvas == 0, route
    await page.goto(BASE+"/apply?event=light-study-01",wait_until="networkidle")
    await page.get_by_role("button",name="Проверить заполнение").click()
    assert await page.locator("#name-error").is_visible()
    await page.locator("#name").fill("Тест")
    await page.locator("#contact").fill("test@example.invalid")
    await page.get_by_role("button",name="Проверить заполнение").click()
    assert "данные не отправлены" in await page.get_by_role("status").inner_text()
    await page.goto(BASE+"/faq#access",wait_until="networkidle")
    trigger=page.get_by_role("button",name="Что означает подтверждённый допуск?")
    assert await trigger.get_attribute("data-state") == "open"
    await page.goto(BASE+"/",wait_until="domcontentloaded")
    await page.goto(BASE+"/events",wait_until="networkidle")
    await page.go_back(wait_until="domcontentloaded")
    assert page.url.rstrip("/") == BASE
    await page.go_forward(wait_until="networkidle")
    assert page.url.endswith("/events")
    for width, height in [(360, 800), (390, 844), (430, 900), (1440, 1000), (1920, 1080)]:
      await page.set_viewport_size({"width": width, "height": height})
      for path in ["/events", "/events/light-study-01", "/apply?event=light-study-01"]:
        await page.goto(BASE+path, wait_until="networkidle")
        overflow=await page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        assert not overflow, f"horizontal overflow {width} {path}"
    await page.set_viewport_size({"width":1280,"height":900})
    await page.goto(BASE+"/events", wait_until="networkidle")
    await page.evaluate("document.documentElement.style.zoom='2'")
    assert await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 4
    await page.evaluate("document.documentElement.style.zoom=''")
    await page.set_viewport_size({"width":390,"height":844})
    await page.goto(BASE+"/events",wait_until="networkidle")
    await page.get_by_role("button",name="Открыть меню").click()
    await page.screenshot(path=str(OUT/"mobile-events-menu-390x844.png"))
    await page.keyboard.press("Escape")
    await page.get_by_role("dialog").wait_for(state="hidden")
    await page.goto(BASE+"/apply?event=light-study-01",wait_until="networkidle")
    await page.screenshot(path=str(OUT/"mobile-apply-390x844.png"))
    await page.set_viewport_size({"width":1440,"height":1800})
    await page.goto(BASE+"/events",wait_until="networkidle")
    await page.screenshot(path=str(OUT/"desktop-events-1440.png"))
    await page.goto(BASE+"/events/light-study-01",wait_until="networkidle")
    await page.screenshot(path=str(OUT/"desktop-event-1440.png"))
    assert not errors, errors
    await browser.close()
  Path("docs/sprint/screenshots/day-03/verification.json").write_text(json.dumps(results,ensure_ascii=False,indent=2))
  print(f"PASS: {len(results)} route states, form, FAQ anchor, history, menu, screenshots")
asyncio.run(main())
