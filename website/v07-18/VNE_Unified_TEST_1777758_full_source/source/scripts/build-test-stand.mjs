// Explicit isolated TEST build; never modifies normal source routes or default build.
import { cp, mkdir, readFile, writeFile, readdir, rm, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { TEST_ACCOUNT_IDS } from "../test-stand/session.mjs";
const unified = process.argv.includes("--unified");
const root = process.cwd(),
  work = path.join(root, ".sites-runtime/test-app");
const manifest = JSON.parse(await readFile(".openai/hosting.json", "utf8"));
if (manifest.project_id !== "appgprj_6ac605807bf88191b7f2d0b5a717505d")
  throw Error("Wrong TEST Site");
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
for (const name of [
  "src",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "tsconfig.json",
  "vite.config.ts",
])
  await cp(path.join(root, name), path.join(work, name), { recursive: true });
await mkdir(path.join(work, "public"), { recursive: true });
await cp(
  path.join(root, unified ? "public" : "public/fonts"),
  path.join(work, unified ? "public" : "public/fonts"),
  { recursive: true },
);
await symlink(path.join(root, "node_modules"), path.join(work, "node_modules"), "dir");
await rm(path.join(work, "src/routes"), { recursive: true });
await cp("test-stand/routes", path.join(work, "src/routes"), { recursive: true });
await rm(path.join(work, "src/routeTree.gen.ts"), { force: true });
// Select exact original handlers, without defining alternative login semantics.
let auth = await readFile("src/lib/auth/auth.functions.ts", "utf8");
auth =
  auth.slice(0, auth.indexOf("export const getMemberState")) +
  auth.slice(auth.indexOf("export const signIn ="), auth.indexOf("export const requestRecovery"));
if (!auth.includes("export const signOut") || auth.includes("getMemberState"))
  throw Error("Auth extraction failed");
const signInBoundary = "const r = await performSignIn(ctx.supabase, data);";
if (!auth.includes(signInBoundary)) throw Error("Missing reviewed login boundary");
auth = auth.replace(
  signInBoundary,
  `const { mapTestAdminIdentifier } = await import("./test-admin-alias.server");
    const mapped = mapTestAdminIdentifier(data.email, process.env["VNE_TEST_ADMIN_MFA"] === "enabled");
    const r = await performSignIn(ctx.supabase, { ...data, email: mapped.email });` +
    `
    if (r.ok) {
      const { data: verified, error } = await ctx.supabase.auth.getUser();
      if (error || !verified.user || !${JSON.stringify(TEST_ACCOUNT_IDS)}.includes(verified.user.id) || verified.user.is_anonymous !== false || (mapped.expectedUserId !== null && verified.user.id !== mapped.expectedUserId)) {
        await ctx.supabase.auth.signOut({ scope: "local" });
        // SSR storage may not see cookies first issued during this same request.
        // Expire every pending session chunk explicitly before rejecting login.
        for (const cookie of [...ctx.pending]) ctx.pending.push({
          name: cookie.name, value: "", options: { ...cookie.options, maxAge: 0 }
        });
        await flush(ctx);
        return { ok: false, message: "Тестовый аккаунт не разрешён." };
      }
    }
`,
);
// No-argument POST actions still need an explicit JSON envelope at the TEST guard.
auth = 'import { emptyActionInput } from "./empty-action-input";\n' + auth;
const signOutBoundary = 'export const signOut = createServerFn({ method: "POST" }).handler';
if (!auth.includes(signOutBoundary)) throw Error("Missing reviewed logout boundary");
auth = auth.replace(
  signOutBoundary,
  'export const signOut = createServerFn({ method: "POST" }).inputValidator(emptyActionInput).handler',
);
// Login followed by rejected-account logout must emit the last write per cookie.
auth = auth.replace(
  "ctx.pending.map((c) => serializeCookieHeader(c.name, c.value, c.options))",
  "[...new Map(ctx.pending.map((c) => [c.name, c])).values()].map((c) => serializeCookieHeader(c.name, c.value, c.options))",
);
await writeFile(path.join(work, "src/lib/auth/auth.functions.ts"), auth);
// Questionnaire animations only: no D1 defaults, local storage or legacy Supabase client.
if (!unified)
  await writeFile(
    path.join(work, "src/components/motion/MotionProvider.tsx"),
    `import {defaultMotionSettings} from '@/lib/motion-settings';\nexport function useMotionEnv(){return {reduced:true,finePointer:false,settings:defaultMotionSettings};}\n`,
  );
await writeFile(
  path.join(work, "src/router.tsx"),
  `import {QueryClient} from '@tanstack/react-query';import {createRouter} from '@tanstack/react-router';import {routeTree} from './routeTree.gen';export const getRouter=()=>createRouter({routeTree,context:{queryClient:new QueryClient()},scrollRestoration:true});\n`,
);
// Unrelated files excluded from typecheck in this isolated generated variant.
const ts = JSON.parse(await readFile(path.join(work, "tsconfig.json"), "utf8"));
ts.include = ["src/router.tsx", "src/routes/**/*.tsx"];
ts.compilerOptions.types.push("node");
await writeFile(path.join(work, "tsconfig.json"), JSON.stringify(ts));
const result = spawnSync("node", ["node_modules/vite/bin/vite.js", "build"], {
  cwd: work,
  stdio: "inherit",
  env: { ...process.env },
});
if (result.status !== 0) process.exit(result.status ?? 1);
await rm(path.join(root, ".output"), { recursive: true, force: true });
await cp(path.join(work, ".output"), path.join(root, ".output"), { recursive: true });
console.log("Isolated TEST build ready");
