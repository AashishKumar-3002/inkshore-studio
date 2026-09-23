/**
 * Inkshore Studio — database schema (Drizzle / PostgreSQL).
 *
 * Design note: chapters live in their own table because they grow
 * unboundedly and need ordering, per-row updates and pagination. The
 * smaller, deeply nested, schema-flexible sub-documents (story bible
 * answers, settings, storyboard, rolling summary) are stored as `jsonb`
 * columns on the project row — they're always read and written as a whole.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  AISettings,
  AnswerMap,
  BookMeta,
  ImageSettings,
  RollingSummary,
  Storyboard,
} from "../types";

/** Matches next-auth's AdapterAccountType, inlined so drizzle-kit's schema
 * loader doesn't have to resolve the next-auth package graph. */
type AdapterAccountType = "oauth" | "oidc" | "email" | "webauthn";

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
  /** bcrypt hash — null for users who only ever sign in through OAuth. */
  passwordHash: text("passwordHash"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
    index("account_user_idx").on(account.userId),
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

export const projects = pgTable(
  "project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    onboardingComplete: boolean("onboardingComplete").notNull().default(false),
    aiSettings: jsonb("aiSettings").$type<AISettings>().notNull(),
    imageSettings: jsonb("imageSettings").$type<ImageSettings>().notNull(),
    book: jsonb("book").$type<BookMeta>().notNull(),
    rollingSummary: jsonb("rollingSummary").$type<RollingSummary>().notNull(),
    storyboard: jsonb("storyboard").$type<Storyboard>().notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    // Written by the process making the change, not by the database clock.
    // Each install has its own database, so defaultNow() would stamp rows
    // with whichever machine's clock happened to serve the write — useless
    // for ordering two devices' edits when sync lands.
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Tombstone. A hard delete can't propagate — see chapters.deletedAt. */
    deletedAt: timestamp("deletedAt", { withTimezone: true }),
  },
  (t) => [index("project_user_updated_idx").on(t.userId, t.updatedAt)]
);

/**
 * Story bible sections, one row each rather than one jsonb blob on the
 * project. The blob made the whole bible a single sync unit: two devices
 * filling in different sections offline would overwrite each other
 * wholesale, and losing an evening's worldbuilding to a merge is the kind
 * of thing an author doesn't forgive.
 *
 * Keyed by (projectId, sectionId), which is stable everywhere — two devices
 * editing the same section land on the same row, so a conflict is a
 * per-section last-write-wins instead of a whole-bible one.
 */
export const bibleSections = pgTable(
  "bible_section",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** A SectionId — feel, philosophy, protagonist, ... */
    sectionId: text("sectionId").notNull(),
    answers: jsonb("answers").$type<AnswerMap>().notNull(),
    notes: text("notes").notNull().default(""),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.sectionId] }),
    index("bible_section_project_idx").on(t.projectId),
  ]
);

export const chapters = pgTable(
  "chapter",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /**
     * Lexicographic ordering key (fractional indexing). Inserting, moving or
     * removing a chapter rewrites exactly this one row, where a dense integer
     * index had to renumber every chapter after the gap. Deliberately NOT
     * unique: two devices editing offline can legitimately mint the same key
     * after the same predecessor, and a unique constraint would reject the
     * merge instead of resolving it. Ties break on id.
     */
    sortKey: text("sortKey").notNull(),
    title: text("title").notNull(),
    idea: text("idea").notNull().default(""),
    content: text("content").notNull().default(""),
    summary: text("summary").notNull().default(""),
    /** ChapterStatus: idea | generating | drafted | final */
    status: text("status").notNull().default("idea"),
    wordCount: integer("wordCount").notNull().default(0),
    locked: boolean("locked").notNull().default(false),
    /** "ai" | "manual" — how the author intends to produce this chapter. */
    mode: text("mode").notNull().default("ai"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    /**
     * Tombstone. A row deleted outright on one device is indistinguishable,
     * on another, from a row that device has never seen — so the delete gets
     * undone on the next merge and the chapter comes back.
     */
    deletedAt: timestamp("deletedAt", { withTimezone: true }),
  },
  (t) => [index("chapter_project_sort_idx").on(t.projectId, t.sortKey)]
);

/** Append-only chapter assistant outputs and pre-edit snapshots. */
export const chapterAssistantEntries = pgTable("chapter_assistant_entry", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  chapterId: text("chapterId").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"result" | "version">().notNull(),
  sourceContent: text("sourceContent").notNull(),
  payload: jsonb("payload").$type<import("../chapterAssistant").AssistantPayload>().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  deletedAt: timestamp("deletedAt", { withTimezone: true }),
}, t => [index("chapter_assistant_history_idx").on(t.chapterId, t.createdAt)]);
