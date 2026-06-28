import React from "react";
import { useGetCases } from "@workspace/api-client-react";
import { Archive } from "lucide-react";

export default function Archiv() {
  const { data: cases, isLoading } = useGetCases({ status: "Abgeschlossen" });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Archive className="w-5 h-5 text-[#c9a227]" />
        <div>
          <h1 className="text-base font-semibold text-white">Archiv</h1>
          <p className="text-xs text-gray-400">Archivierte und abgeschlossene Fälle.</p>
        </div>
      </div>
      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#0a0f1a] border-b border-[#1e2d4a]">
              {["Fallnummer", "Titel", "Kategorie", "Leitender Agent", "Erstellt", "Abgeschlossen"].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-gray-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Laden...</td></tr>
            ) : !cases?.length ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Keine archivierten Fälle.</td></tr>
            ) : cases.map(c => (
              <tr key={c.id} className="border-b border-[#1e2d4a]/40 hover:bg-[#1a2744]/30">
                <td className="px-4 py-2.5 text-[#c9a227] font-mono">{c.caseNumber}</td>
                <td className="px-4 py-2.5 text-white">{c.title}</td>
                <td className="px-4 py-2.5 text-gray-400">{c.category}</td>
                <td className="px-4 py-2.5 text-gray-400">{c.leadAgent}</td>
                <td className="px-4 py-2.5 text-gray-500">{c.createdAt}</td>
                <td className="px-4 py-2.5 text-gray-500">{c.closedAt ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
