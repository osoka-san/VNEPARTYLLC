import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  check,
  index,
} from "drizzle-orm/sqlite-core";

// Design recipes only. No event, member, ticket, or QR payload records.
export const qrPatternVersions = sqliteTable(
  "qr_pattern_versions",
  {
    patternId: text("pattern_id").notNull(),
    version: integer("version").notNull(),
    recipe: text("recipe").notNull(),
    searchText: text("search_text").notNull(),
    engineVersion: text("engine_version").notNull(),
    archived: integer("archived").notNull().default(0),
    createdAt: text("created_at").notNull(),
    operationId: text("operation_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.patternId, t.version] }),
    uniqueIndex("qr_pattern_operation_unique").on(t.operationId),
    check("qr_pattern_version_positive", sql`${t.version} > 0`),
    check("qr_pattern_archived_boolean", sql`${t.archived} IN (0,1)`),
    check("qr_pattern_recipe_json", sql`json_valid(${t.recipe})`),
  ],
);

// Access to this Sites review workspace is separate from membership / ticket admission.
export const siteAccounts = sqliteTable("site_accounts", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  disabled: integer("disabled").notNull().default(0),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  lastLoginAt: text("last_login_at"),
});
export const siteStaffAssignments = sqliteTable("staff_assignments", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => siteAccounts.id),
  role: text("role").notNull(),
  permissions: text("permissions").notNull(),
});
export const siteSessions = sqliteTable("site_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => siteAccounts.id),
  accountVersion: integer("account_version").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const siteAudit = sqliteTable("site_audit", {
  id: text("id").primaryKey(),
  accountId: text("account_id"),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  createdAt: text("created_at").notNull(),
});
export const siteLoginLimits = sqliteTable("site_login_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  until: integer("until").notNull(),
});
export const siteContentDrafts = sqliteTable("site_content_drafts", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sitePreviewDefaults = sqliteTable("site_preview_defaults", {
  key: text("key").primaryKey(),
  version: integer("version").notNull(),
  settings: text("settings").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

// Sites preview queues are separate from Supabase membership and event admissions.
export const siteReviewRequests = sqliteTable(
  "site_review_requests",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    telegram: text("telegram").notNull(),
    eventKey: text("event_key").notNull(),
    eventTitle: text("event_title").notNull(),
    details: text("details").notNull(),
    searchText: text("search_text").notNull(),
    status: text("status").notNull().default("submitted"),
    note: text("note").notNull().default(""),
    version: integer("version").notNull().default(1),
    source: text("source").notNull(),
    consentVersion: text("consent_version").notNull(),
    fingerprint: text("fingerprint").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => siteAccounts.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("site_review_requests_queue_idx").on(t.kind, t.status, t.createdAt),
    index("site_review_requests_actor_idx").on(t.createdBy, t.createdAt),
    check("site_review_requests_kind", sql`${t.kind} IN ('membership','event')`),
    check(
      "site_review_requests_status",
      sql`${t.status} IN ('submitted','under_review','needs_info','waitlisted','approved','rejected')`,
    ),
    check("site_review_requests_version", sql`${t.version} > 0`),
  ],
);
export const siteReviewRequestHistory = sqliteTable(
  "site_review_request_history",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => siteReviewRequests.id),
    operationId: text("operation_id").notNull().unique(),
    fingerprint: text("fingerprint").notNull(),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    note: text("note").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => siteAccounts.id),
    actorName: text("actor_name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("site_request_history_order_idx").on(t.requestId, t.createdAt)],
);
