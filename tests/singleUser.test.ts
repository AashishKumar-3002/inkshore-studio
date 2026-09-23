import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Single-user mode is decided by env, and getting it wrong in either
 * direction is serious: leaving it on for a hosted deployment would serve
 * every visitor the same library.
 */
async function freshModule() {
  vi.resetModules();
  return import("@/lib/localUser");
}

afterEach(() => {
  delete process.env.INKSHORE_DB_DIR;
  delete process.env.INKSHORE_DESKTOP;
  delete process.env.INKDROP_DB_DIR;
  delete process.env.INKDROP_DESKTOP;
  delete process.env.DATABASE_URL;
});

describe("single-user mode", () => {
  it("is on when the app owns an embedded database", async () => {
    process.env.INKSHORE_DB_DIR = "/tmp/library";
    const { isSingleUserMode } = await freshModule();
    expect(isSingleUserMode()).toBe(true);
  });

  it("recognises the pre-rebrand embedded database variable", async () => {
    process.env.INKDROP_DB_DIR = "/tmp/legacy-library";
    const { isSingleUserMode } = await freshModule();
    expect(isSingleUserMode()).toBe(true);
  });

  it("is off for a hosted deployment", async () => {
    process.env.DATABASE_URL = "postgres://user:pw@db.example.com/inkdrop";
    const { isSingleUserMode } = await freshModule();
    expect(isSingleUserMode()).toBe(false);
  });

  it("stays off for a desktop build pointed at a shared Postgres", async () => {
    // The desktop flag alone must not disable auth: that database may hold
    // other people's work, so it still has to be signed in to.
    process.env.INKSHORE_DESKTOP = "1";
    process.env.DATABASE_URL = "postgres://user:pw@db.example.com/inkdrop";
    const { isSingleUserMode } = await freshModule();
    expect(isSingleUserMode()).toBe(false);
  });
});
