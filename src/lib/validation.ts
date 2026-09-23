import { z } from "zod";
import { AI_PROVIDER_IDS, SECTION_IDS } from "@/lib/types";

/* ---------------------------------------------------------------- */
/* Auth                                                              */
/* ---------------------------------------------------------------- */

export const credentialsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(100),
  email: z.string().trim().email("Enter a valid email address.").max(320),
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .max(200, "That password is too long."),
});

/* ---------------------------------------------------------------- */
/* Story bible                                                       */
/* ---------------------------------------------------------------- */

const answerValueSchema = z.object({
  selected: z.array(z.string().max(200)).max(50),
  custom: z.string().max(5000),
});

const sectionSchema = z.object({
  answers: z.record(z.string().max(100), answerValueSchema),
  notes: z.string().max(20000),
});

export const storyBibleSchema = z.object(
  Object.fromEntries(SECTION_IDS.map((id) => [id, sectionSchema])) as Record<
    (typeof SECTION_IDS)[number],
    typeof sectionSchema
  >
);

export const bibleUpdateSchema = z.object({
  storyBible: storyBibleSchema.optional(),
  onboardingComplete: z.boolean().optional(),
});

export const extractSchema = z.object({
  text: z.string().trim().min(1, "Paste some text or upload a file first.").max(200_000),
});

/* ---------------------------------------------------------------- */
/* Projects                                                          */
/* ---------------------------------------------------------------- */

export const createProjectSchema = z.object({
  name: z.string().trim().max(200).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  onboardingComplete: z.boolean().optional(),
});

export const aiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDER_IDS).optional(),
  model: z.string().trim().max(200).optional(),
  fullContextWindow: z.number().int().min(0).max(50).optional(),
  /** Plaintext key from the settings form; encrypted before it's stored. */
  apiKey: z.string().max(500).optional(),
  apiKeyProvider: z.enum(AI_PROVIDER_IDS).optional(),
});

export const imageSettingsSchema = z.object({
  provider: z.literal("openai").optional(),
  model: z.string().trim().max(200).optional(),
  apiKey: z.string().max(500).optional(),
});

export const rollingSummarySchema = z.object({
  enabled: z.boolean().optional(),
});

export const bookSchema = z.object({
  title: z.string().max(300).optional(),
  subtitle: z.string().max(300).optional(),
  author: z.string().max(200).optional(),
  coverImageDataUrl: z
    .string()
    .max(12_000_000)
    .refine((v) => v === "" || /^data:image\/(png|jpeg|webp|gif);base64,/.test(v), {
      message: "Cover must be a PNG, JPEG, WebP or GIF data URL.",
    })
    .optional(),
});

/* ---------------------------------------------------------------- */
/* Chapters                                                          */
/* ---------------------------------------------------------------- */

export const chapterStatusSchema = z.enum(["idea", "generating", "drafted", "final"]);

export const createChapterSchema = z.object({
  title: z.string().trim().max(300).optional(),
  idea: z.string().max(20000).optional(),
  content: z.string().max(2_000_000).optional(),
  status: chapterStatusSchema.optional(),
  mode: z.enum(["ai", "manual"]).optional(),
});

export const bulkChaptersSchema = z.object({
  chapters: z
    .array(
      z.object({
        title: z.string().trim().max(300),
        content: z.string().max(2_000_000),
        status: chapterStatusSchema,
      })
    )
    .min(1)
    .max(200),
});

export const updateChapterSchema = z.object({
  title: z.string().trim().max(300).optional(),
  idea: z.string().max(20000).optional(),
  content: z.string().max(2_000_000).optional(),
  summary: z.string().max(20000).optional(),
  status: chapterStatusSchema.optional(),
  locked: z.boolean().optional(),
  mode: z.enum(["ai", "manual"]).optional(),
});

export const generateChapterSchema = z.object({
  provider: z.enum(AI_PROVIDER_IDS).optional(),
  model: z.string().trim().max(200).optional(),
});

/* ---------------------------------------------------------------- */
/* Storyboard / cover                                                */
/* ---------------------------------------------------------------- */

export const storyboardSchema = z.object({
  notes: z
    .array(
      z.object({
        id: z.string().max(100),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        text: z.string().max(5000),
        color: z.string().max(50),
      })
    )
    .max(500)
    .optional(),
  strokes: z
    .array(
      z.object({
        id: z.string().max(100),
        points: z.array(z.object({ x: z.number(), y: z.number() })).max(10000),
        color: z.string().max(50),
        width: z.number().min(0).max(100),
      })
    )
    .max(2000)
    .optional(),
});

const imageDataUrlSchema = z
  .string()
  .max(12_000_000)
  .refine((v) => /^data:image\/(png|jpeg|webp);base64,/.test(v), {
    message: "Expected a PNG, JPEG or WebP data URL.",
  });

export const storyboardAskSchema = z.object({
  question: z.string().trim().min(1, "Ask a question first.").max(5000),
  canvasImageDataUrl: imageDataUrlSchema.optional(),
});

export const coverSuggestSchema = z.object({
  vision: z.string().max(5000).optional(),
});

export const coverGenerateSchema = z.object({
  prompt: z.string().trim().min(1, "Describe the cover you want.").max(5000),
});

/* ---------------------------------------------------------------- */
/* Import                                                            */
/* ---------------------------------------------------------------- */

const NOT_AN_EXPORT = "This doesn't look like an Inkshore project export.";

export const importProjectSchema = z
  .object({
    name: z.string().max(200).optional(),
    __importName: z.string().max(200).optional(),
    // Both messages are deliberately the same: a user who picked the wrong
    // file needs to know that, not which JSON key was missing.
    storyBible: z.record(z.string(), z.unknown(), { message: NOT_AN_EXPORT }),
    chapters: z.array(z.unknown(), { message: NOT_AN_EXPORT }).max(5000),
  })
  .passthrough();
