import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const officersTable = pgTable("officers", {
  id: serial("id").primaryKey(),
  dienstnummer: text("dienstnummer").notNull().unique(),
  passwortHash: text("passwort_hash").notNull(),
  name: text("name").notNull(),
  rank: text("rank").notNull(),
  division: text("division").notNull().default("Special Investigation Division"),
  status: text("status").notNull().default("Anwesend"),
  radioStatus: text("radio_status").notNull().default("Aktiv"),
  radioFreq: text("radio_freq").notNull().default("555-0100"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOfficerSchema = createInsertSchema(officersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOfficer = z.infer<typeof insertOfficerSchema>;
export type Officer = typeof officersTable.$inferSelect;
