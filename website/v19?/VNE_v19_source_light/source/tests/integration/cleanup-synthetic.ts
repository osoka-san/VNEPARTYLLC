/**
 * Повторная очистка прерванного прогона ТОЛЬКО по manifest: bun tests/integration/cleanup-synthetic.ts <manifest.json>
 * Прежний sweep по *@synthetic.invalid / slug synthetic-% удалён и запрещён: он мог задеть чужие записи.
 * Реальные аккаунты и owner не трогаются — удаляются только точные UUID, записанные этим run.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { cleanupByManifest, validateManifest } from "./manifest-cleanup";

const url = process.env["SUPABASE_URL"];
const svc = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const file = process.argv[2];
if (process.env["VNE_INTEGRATION"] !== "cloud-synthetic" || !url || !svc) {
  console.log("NOT VERIFIED (skip): нет VNE_INTEGRATION=cloud-synthetic или ключей");
  process.exit(77);
}
if (!file) {
  console.log("FAIL: укажите путь к manifest конкретного прогона");
  process.exit(2);
}
const manifest = validateManifest(JSON.parse(readFileSync(file, "utf8")));
const admin = createClient(url, svc, { auth: { persistSession: false } });
const res = await cleanupByManifest(admin, manifest);
process.exit(res.ok ? 0 : 1);
