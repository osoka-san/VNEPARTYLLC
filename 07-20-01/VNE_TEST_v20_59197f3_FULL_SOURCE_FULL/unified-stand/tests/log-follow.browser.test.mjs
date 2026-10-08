// Real Chromium component regression tests, with synthetic in-memory telemetry only.
// Uses an existing Playwright installation; never installs or changes dependencies.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright"
);
const root = fileURLToPath(new URL("../../", import.meta.url));
let browser, page, server, directory, origin;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "vne-log-follow-"));
  await build({
    absWorkingDir: root,
    entryPoints: ["unified-stand/tests/log-follow.fixture.tsx"],
    outfile: path.join(directory, "fixture.js"),
    bundle: true,
    format: "esm",
    jsx: "automatic",
    sourcemap: false,
    define: { "process.env.NODE_ENV": '"test"' },
  });
  server = http.createServer(async (request, response) => {
    const asset =
      request.url === "/fixture.js"
        ? "fixture.js"
        : request.url === "/fixture.css"
          ? "fixture.css"
          : null;
    response.setHeader(
      "Content-Type",
      asset?.endsWith(".js") ? "text/javascript" : asset ? "text/css" : "text/html",
    );
    response.end(
      asset
        ? await readFile(path.join(directory, asset))
        : '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    headless: true,
  });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await page?.close();
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await page.clock.install({ time: new Date("2026-10-08T12:00:00Z") });
  await page.goto(origin);
  await page.getByRole("button", { name: "Журнал событий" }).click();
  await page.locator(".obs-log-row").first().waitFor();
});
const metrics = () =>
  page
    .locator(".obs-log-list")
    .evaluate((list) => ({ top: list.scrollTop, max: list.scrollHeight - list.clientHeight }));
async function scrollTo(top) {
  await page.locator(".obs-log-list").evaluate((list, position) => {
    list.scrollTop = position === "bottom" ? list.scrollHeight : position;
    list.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, top);
}
async function append() {
  const count = await page.locator(".obs-log-row").count();
  await page.locator("#append").click();
  await page.waitForFunction(
    (count) => document.querySelectorAll(".obs-log-row").length === count + 1,
    count,
  );
}

test("a 20-second clock advance with no new event preserves the reading position", async () => {
  await scrollTo(120);
  const before = await metrics();
  await page.clock.runFor(20001);
  assert.equal((await metrics()).top, before.top);
  assert.equal(await page.locator(".obs-log-row").count(), 20);
});
test("append follows near the bottom and preserves a user-scrolled older position", async () => {
  await scrollTo("bottom");
  await scrollTo((await metrics()).max - 20);
  await append();
  let result = await metrics();
  assert.ok(Math.abs(result.top - result.max) <= 1);
  await scrollTo(120);
  await append();
  assert.equal((await metrics()).top, 120);
});
test("keyboard focus blocks new-entry follow and stays clear of the sticky heading", async () => {
  await scrollTo("bottom");
  await page.locator(".obs-log-list").focus();
  await page.keyboard.press("Home");
  await page.clock.runFor(500);
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .locator(".obs-log-row")
      .first()
      .evaluate((row) => row === document.activeElement),
    true,
  );
  await page.clock.runFor(20001);
  const focused = await page
    .locator(".obs-log-row")
    .first()
    .evaluate((row) => {
      const header = document.querySelector(".obs-log-columns").getBoundingClientRect();
      return { top: row.getBoundingClientRect().top, headerBottom: header.bottom };
    });
  assert.ok(focused.top >= focused.headerBottom - 1, JSON.stringify(focused));
  // Trigger a real fixed-type telemetry event without moving keyboard focus.
  await page.locator("#append").evaluate((button) => button.click());
  assert.equal(
    await page
      .locator(".obs-log-row")
      .first()
      .evaluate((row) => row === document.activeElement),
    true,
  );
  assert.equal((await metrics()).top, 0);
  // Focus at the end also pauses follow: do not pull a focused row away on arrival.
  await page.locator(".obs-log-row").last().focus();
  const before = await metrics();
  await page.locator("#append").evaluate((button) => button.click());
  assert.equal((await metrics()).top, before.top);
  await page.keyboard.press("Shift+Tab");
  const previous = await page
    .locator(".obs-log-row")
    .nth(19)
    .evaluate((row) => row === document.activeElement);
  assert.equal(previous, true);
});
test("pause/resume, filter changes and demo switches do not masquerade as new events", async () => {
  await scrollTo(120);
  await page.getByRole("button", { name: "Пауза вида", exact: true }).click();
  await page.locator("#append").click();
  assert.equal(await page.locator(".obs-log-row").count(), 20);
  assert.equal((await metrics()).top, 120);
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  assert.equal(await page.locator(".obs-log-row").count(), 21);
  assert.equal((await metrics()).top, 120);
  await page
    .getByRole("textbox", { name: "Поиск по событиям и correlation ID" })
    .fill("нет совпадений");
  assert.equal(await page.locator(".obs-log-row").count(), 0);
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  assert.equal((await metrics()).top, 0);
  await page.getByRole("button", { name: "Примеры", exact: true }).click();
  assert.equal(await page.locator(".obs-log-row").count(), 8);
  assert.equal((await metrics()).top, 0);
  await page.clock.runFor(20001);
  assert.equal((await metrics()).top, 0);
  await page.getByRole("button", { name: "Этот браузер", exact: true }).click();
  assert.equal((await metrics()).top, 0);
});
test("follow-off and filtered-out arrivals preserve position; expiry never jumps to the end", async () => {
  await scrollTo("bottom");
  await page.getByRole("checkbox", { name: "Следить за новыми" }).uncheck();
  const before = await metrics();
  await append();
  assert.equal((await metrics()).top, before.top);
  await page.getByRole("checkbox", { name: "Следить за новыми" }).check();
  assert.equal((await metrics()).top, before.top);
  await page.getByRole("combobox", { name: "Уровень события" }).selectOption("info");
  await scrollTo(120);
  await page.locator("#append-error").click();
  assert.equal((await metrics()).top, 120);
  await page.getByRole("combobox", { name: "Период событий" }).selectOption("15");
  await page.clock.runFor(16 * 60000);
  assert.equal(await page.locator(".obs-log-row").count(), 0);
  assert.equal((await metrics()).top, 0);
});
test("rolling buffer follows an actual append even when the row count stays 200", async () => {
  await scrollTo("bottom");
  await page.locator("#append-many").click();
  assert.equal(await page.locator(".obs-log-row").count(), 200);
  let result = await metrics();
  assert.ok(Math.abs(result.top - result.max) <= 1);
  await page.locator("#append").click();
  assert.equal(await page.locator(".obs-log-row").count(), 200);
  result = await metrics();
  assert.ok(Math.abs(result.top - result.max) <= 1);
});
test("responsive sticky-heading clearance matches desktop/tablet and header-free mobile", async () => {
  for (const width of [360, 390, 430, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator("#append").focus();
    await scrollTo("bottom");
    await page.locator(".obs-log-row").first().focus();
    const result = await page.locator(".obs-log-list").evaluate((list) => {
      const header = list.querySelector(".obs-log-columns");
      const row = list.querySelector(".obs-log-row").getBoundingClientRect();
      return {
        top: row.top,
        boundary:
          getComputedStyle(header).display === "none"
            ? list.getBoundingClientRect().top + 1
            : header.getBoundingClientRect().bottom,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.ok(result.top >= result.boundary - 1, `${width}px: ${JSON.stringify(result)}`);
    assert.equal(result.overflow, false, `${width}px horizontal overflow`);
  }
});
