import { describe, expect, it } from "vitest";
import {
  appendBibleNotes,
  buildPreviews,
  masterCommandJsonSchema,
  needsConfirmation,
  parseMasterCommand,
  type MasterAction,
} from "@/lib/masterCommand";
import { emptyStoryBible, type Project } from "@/lib/types";

const answer = { reply: "I'd bring the sister back first.", intent: "answer", actions: [] };
const plan = {
  reply: "Here is a four chapter plan.",
  intent: "plan_chapters",
  actions: [{ type: "plan_chapters", chapters: [{ title: "The Ledger", idea: "She finds the falsified accounts." }] }],
};
const note = {
  reply: "Noted in the bible.",
  intent: "update_bible",
  actions: [{ type: "update_bible", sectionId: "protagonist", notes: "He is afraid of open water." }],
};

function project(chapters = 2, notes = ""): Pick<Project, "storyBible" | "chapters"> {
  const storyBible = emptyStoryBible();
  storyBible.protagonist.notes = notes;
  return {
    storyBible,
    chapters: Array.from({ length: chapters }, (_, index) => ({
      id: `c${index}`, index: index + 1, title: `Chapter ${index + 1}`, idea: "", content: "", summary: "",
      status: "drafted" as const, wordCount: 0, locked: false, mode: "ai" as const, createdAt: "", updatedAt: "",
    })),
  };
}

describe("master command response validation", () => {
  it("accepts each intent and strips a Markdown fence", () => {
    expect(parseMasterCommand(JSON.stringify(answer)).intent).toBe("answer");
    expect(parseMasterCommand("```json\n" + JSON.stringify(plan) + "\n```").actions).toHaveLength(1);
    expect(parseMasterCommand(JSON.stringify(note)).actions[0]).toMatchObject({ type: "update_bible", sectionId: "protagonist" });
  });

  it("rejects anything that isn't a valid response object", () => {
    expect(() => parseMasterCommand("Sure! Here's a plan.")).toThrow();
    expect(() => parseMasterCommand(JSON.stringify({ reply: "", intent: "answer", actions: [] }))).toThrow();
    expect(() => parseMasterCommand(JSON.stringify({ ...answer, intent: "delete_everything" }))).toThrow();
  });

  it("rejects a reply whose actions contradict its intent", () => {
    // The author reads the reply and confirms the actions — the case where the
    // two disagree is exactly the case where they'd approve something unread.
    expect(() => parseMasterCommand(JSON.stringify({ ...answer, actions: plan.actions }))).toThrow(/must not propose actions/);
    expect(() => parseMasterCommand(JSON.stringify({ ...plan, actions: [] }))).toThrow(/requires a matching action/);
    expect(() => parseMasterCommand(JSON.stringify({ ...plan, actions: note.actions }))).toThrow(/only plan_chapters/);
  });

  it("rejects an unknown bible section and an oversized chapter plan", () => {
    expect(() => parseMasterCommand(JSON.stringify({ ...note, actions: [{ type: "update_bible", sectionId: "chapters", notes: "x" }] }))).toThrow();
    const chapters = Array.from({ length: 21 }, (_, i) => ({ title: `T${i}`, idea: "Something happens." }));
    expect(() => parseMasterCommand(JSON.stringify({ ...plan, actions: [{ type: "plan_chapters", chapters }] }))).toThrow();
  });

  it("emits anyOf rather than oneOf, which strict structured output rejects", () => {
    const schema = JSON.stringify(masterCommandJsonSchema());
    expect(schema).toContain("anyOf");
    expect(schema).not.toContain("oneOf");
  });
});

describe("previews and confirmation", () => {
  it("treats any action as a write and a bare answer as none", () => {
    expect(needsConfirmation({ actions: plan.actions as MasterAction[] })).toBe(true);
    expect(needsConfirmation({ actions: [] })).toBe(false);
  });

  it("numbers planned chapters from the end of the existing ones", () => {
    const [preview] = buildPreviews(plan.actions as MasterAction[], project(2));
    expect(preview.title).toContain("Add 1 chapter after your current 2");
    expect(preview.detail).toBe("3. The Ledger — She finds the falsified accounts.");
  });

  it("shows a bible note as an append, never a replacement", () => {
    const [preview] = buildPreviews(note.actions as MasterAction[], project(0, "He was a fisherman."));
    expect(preview.title).toBe("Add a note to Story Bible → Protagonist");
    expect(preview.before).toBe("He was a fisherman.");
    expect(preview.after).toBe("He was a fisherman.\n\nHe is afraid of open water.");
  });

  it("appends without leaving blank lines when a side is empty", () => {
    expect(appendBibleNotes("", "New.")).toBe("New.");
    expect(appendBibleNotes("Old.", "")).toBe("Old.");
    expect(appendBibleNotes("  Old.  ", " New. ")).toBe("Old.\n\nNew.");
  });
});
