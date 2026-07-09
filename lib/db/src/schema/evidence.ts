import { pgTable, text, serial, timestamp, integer, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const evidenceTable = pgTable("evidence", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  caseId: integer("case_id").notNull(),
  caseNumber: text("case_number").notNull(),
  addedBy: text("added_by").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEvidenceSchema = createInsertSchema(evidenceTable).omit({ id: true, addedAt: true });
export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;
export type Evidence = typeof evidenceTable.$inferSelect;

export const evidenceFilesTable = pgTable("evidence_files", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  objectPath: text("object_path").notNull(),
  originalName: text("original_name").notNull(),
  mimetype: text("mimetype").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  description: text("description"),
  uploadedBy: text("uploaded_by"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEvidenceFileSchema = createInsertSchema(evidenceFilesTable).omit({ id: true, uploadedAt: true });
export type InsertEvidenceFile = z.infer<typeof insertEvidenceFileSchema>;
export type EvidenceFile = typeof evidenceFilesTable.$inferSelect;
