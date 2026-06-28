import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const idChangesTable = pgTable("id_changes", {
  id: serial("id").primaryKey(),
  dienstnummer: text("dienstnummer").notNull(),
  name: text("name").notNull(),
  rank: text("rank").notNull(),
  eigeneId: text("eigene_id"),
  neueId: text("neue_id"),
  datum: text("datum"),
  uhrzeitAnfang: text("uhrzeit_anfang"),
  uhrzeitEnde: text("uhrzeit_ende"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertIdChangeSchema = createInsertSchema(idChangesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIdChange = z.infer<typeof insertIdChangeSchema>;
export type IdChange = typeof idChangesTable.$inferSelect;
