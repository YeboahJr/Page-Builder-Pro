import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
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
  deckname: text("deckname"),
  telNr: text("tel_nr"),
  beitritt: text("beitritt"),
  einweisung: boolean("einweisung").notNull().default(false),
  waffenfreigabeLMG: boolean("waffenfreigabe_lmg").notNull().default(false),
  waffenfreigabeHeavySniper: boolean("waffenfreigabe_heavy_sniper").notNull().default(false),
  freigabeCCU: boolean("freigabe_ccu").notNull().default(false),
  freigabeZivil: boolean("freigabe_zivil").notNull().default(false),
  freigabeUndercover: boolean("freigabe_undercover").notNull().default(false),
  meldeamtSAHP: boolean("meldeamt_sahp").notNull().default(false),
  meldeamtPD: boolean("meldeamt_pd").notNull().default(false),
  meldeamtLI: boolean("meldeamt_li").notNull().default(false),
  idChange: boolean("id_change").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOfficerSchema = createInsertSchema(officersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOfficer = z.infer<typeof insertOfficerSchema>;
export type Officer = typeof officersTable.$inferSelect;
