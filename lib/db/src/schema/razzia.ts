import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

// Razzia-Anträge (Antrag auf Durchsuchungsbefehl): nur für Direktion/Leitung
// sichtbar. `target` ist das Feld "Antrag auf Durchsuchungsbefehl" (gegen wen),
// `caseIds` verweist auf die angehängten abgeschlossenen Akten.
export const razziaAntraegeTable = pgTable("razzia_antraege", {
  id: serial("id").primaryKey(),
  target: text("target").notNull(),
  caseIds: integer("case_ids").array().notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
