import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
export function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(readFileSync(new URL("../drizzle/" + file, import.meta.url), "utf8"));
  const DB = {
    prepare(query) {
      const stmt = sql.prepare(query);
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return stmt.get(...args) ?? null;
        },
        async all() {
          return { results: stmt.all(...args) };
        },
        async run() {
          const meta = stmt.run(...args);
          return { success: true, meta };
        },
        _exec() {
          return stmt.columns().length
            ? { results: stmt.all(...args), success: true }
            : { results: [], success: true, meta: stmt.run(...args) };
        },
      };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const result = statements.map((s) => s._exec());
        sql.exec("COMMIT");
        return result;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { DB, sql };
}
export function testEnv() {
  return {
    ...database(),
    VNE_ADMIN_USERNAME: "synthetic-admin",
    VNE_ADMIN_PASSWORD: "synthetic-admin-password",
    VNE_ADMIN_SESSION_SECRET: "synthetic-session-secret-1234567890",
    VNE_REVIEW_PASSWORD: "synthetic-review-password",
    VNE_DELIVERY_MODE: "disabled",
  };
}
