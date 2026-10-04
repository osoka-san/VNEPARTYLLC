"""Скриншоты под синтетическим входом штатным способом (/login email+пароль, /auth/mfa TOTP).
Учётные данные только из env, не печатаются. Использование:
  python3 e2e_screens.py <phase> <out_dir>   phase: guest_question | guest_history | staff_queue
env: E2E_APP, E2E_EMAIL, E2E_PASS, E2E_TOTP_SECRET (для staff), E2E_APP_ID, E2E_EVENT_SLUG
"""
import asyncio, base64, hashlib, hmac, json, os, struct, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

APP = os.environ.get("E2E_APP", "http://localhost:8080")
phase, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
result = {"phase": phase, "shots": [], "checks": {}}


def totp(secret: str, t: float) -> str:
    key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    h = hmac.new(key, struct.pack(">Q", int(t // 30)), hashlib.sha1).digest()
    o = h[-1] & 15
    return str((struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 1000000).zfill(6)


async def shot(page, name):
    p = out / f"{name}.png"
    await page.screenshot(path=str(p))
    result["shots"].append(p.name)


async def login(page, email, password, redirect):
    await page.goto(f"{APP}/login?redirect={redirect}", wait_until="networkidle")
    await page.fill("#email", email)
    await page.fill("#password", password)
    await page.get_by_role("button", name="Войти").first.click()
    await page.wait_for_timeout(4000)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        email, pw = os.environ["E2E_EMAIL"], os.environ["E2E_PASS"]
        app_id = os.environ.get("E2E_APP_ID", "")
        if phase in ("guest_question", "guest_history"):
            await login(page, email, pw, f"/member/applications/{app_id}")
            await page.goto(f"{APP}/member/applications/{app_id}", wait_until="networkidle")
            await page.wait_for_timeout(2500)
            body = await page.inner_text("body")
            result["checks"]["url"] = page.url.replace(app_id, "<app>")
            result["checks"]["question_visible"] = "Вопрос команды" in body
            result["checks"]["reply_visible"] = "Ваш ответ" in body
            await shot(page, f"{phase}-application")
            if phase == "guest_question":
                slug = os.environ.get("E2E_EVENT_SLUG", "")
                await page.goto(f"{APP}/member?event={slug}", wait_until="networkidle")
                await page.wait_for_timeout(2500)
                await shot(page, "guest-member-form")
                await page.goto(f"{APP}/admin/applications", wait_until="networkidle")
                await page.wait_for_timeout(2500)
                body = await page.inner_text("body")
                result["checks"]["admin_denied_url"] = page.url
                result["checks"]["admin_queue_hidden"] = "Очередь" not in body or "закрыт" in body.lower()
                await shot(page, "guest-admin-denied")
        elif phase == "staff_queue":
            await login(page, email, pw, "/admin/applications")
            # ждём следующее 30-секундное окно, чтобы код не совпал с API-подтверждением
            time.sleep(31 - (time.time() % 30))
            if "/auth/mfa" not in page.url:
                await page.goto(f"{APP}/auth/mfa?redirect=/admin/applications", wait_until="networkidle")
            await page.fill("#code", totp(os.environ["E2E_TOTP_SECRET"], time.time()))
            await page.get_by_role("button").filter(has_text="Подтвердить").first.click()
            await page.wait_for_timeout(4000)
            await page.goto(f"{APP}/admin/applications", wait_until="networkidle")
            await page.wait_for_timeout(3000)
            body = await page.inner_text("body")
            result["checks"]["url"] = page.url
            result["checks"]["queue_has_synthetic"] = "Гость E2E" in body or "Гость" in body
            await shot(page, "staff-queue")
        await b.close()
    print(json.dumps(result, ensure_ascii=False))


asyncio.run(main())
