# No-JS проверка форм: SSR-разметка /apply без JavaScript. Вывод — sanitized JSON (без данных пользователей).
import asyncio, json, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else "nojs-forms.json"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(java_script_enabled=False, viewport={"width": 1280, "height": 1800})
        pg = await ctx.new_page()
        res = {}
        r = await pg.goto("http://localhost:8080/apply", wait_until="domcontentloaded")
        f = pg.locator("form").first
        res["apply"] = {
            "status": r.status,
            "method": await f.get_attribute("method"),
            "aria_disabled": await f.get_attribute("aria-disabled"),
            "fieldset_disabled": await pg.locator("form fieldset").first.is_disabled(),
            "url_has_query": "?" in pg.url,
        }
        r2 = await pg.goto("http://localhost:8080/member/applications/00000000-0000-4000-8000-000000000000", wait_until="domcontentloaded")
        res["reply_anon"] = {"status": r2.status, "final_path": pg.url.split("8080")[1].split("?")[0]}
        await b.close()
        json.dump(res, open(OUT, "w"), ensure_ascii=False, indent=2); print(json.dumps(res, ensure_ascii=False))
asyncio.run(main())
