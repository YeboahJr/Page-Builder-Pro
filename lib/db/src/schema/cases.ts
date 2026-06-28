import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const casesTable = pgTable("cases", {
  id: serial("id").primaryKey(),
  caseNumber: text("case_number").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  priority: text("priority").notNull().default("Mittel"),
  status: text("status").notNull().default("Offen"),
  leadAgent: text("lead_agent").notNull(),
  description: text("description"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const casePersonsTable = pgTable("case_persons", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  name: text("name").notNull(),
  currentId: text("current_id").notNull(),
  formerIds: text("former_ids"),
  role: text("role").notNull(),
  lastLocation: text("last_location"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const caseAgentsTable = pgTable("case_agents", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const caseStatusHistoryTable = pgTable("case_status_history", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  changedBy: text("changed_by").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCaseSchema = createInsertSchema(casesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof casesTable.$inferSelect;
