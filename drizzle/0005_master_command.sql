CREATE TABLE "project_command_run" (
  "id" text PRIMARY KEY NOT NULL,
  "projectId" text NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'proposed',
  "transcript" text NOT NULL,
  "payload" jsonb NOT NULL,
  "idempotencyKey" text,
  "appliedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL,
  "deletedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "project_command_run_history_idx" ON "project_command_run" ("projectId", "createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX "project_command_run_idempotency_idx" ON "project_command_run" ("idempotencyKey");
