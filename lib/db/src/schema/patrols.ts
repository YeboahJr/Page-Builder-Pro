import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const patrolsTable = pgTable("patrols", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  patrolType: text("patrol_type").notNull().default("Regelstreife"),
  status: text("status").notNull().default("Code 1"),
  vehicle: text("vehicle"),
  slots: jsonb("slots").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPatrolSchema = createInsertSchema(patrolsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPatrol = z.infer<typeof insertPatrolSchema>;
export type Patrol = typeof patrolsTable.$inferSelect;
