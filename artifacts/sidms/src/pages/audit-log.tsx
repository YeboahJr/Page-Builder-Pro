import React from "react";
import { useGetDashboardRecentActivity } from "@workspace/api-client-react";
import { History } from "lucide-react";

export default function AuditLog() {
  const { data: activity, isLoading } = useGetDashboardRecentActivity();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <History className="w-5 h-5 text-[#c9a227]" />
        <div>
          <h1 className="text-base font-semibold text-white">Audit-Log</h1>
          <p className="text-xs text-gray-400">Chronologisches Protokoll aller Systemaktionen.</p>
        </div>
      </div>
      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#0a0f1a] border-b border-[#1e2d4a]">
              {["Zeitstempel", "Aktion", "Agent", "Fallnummer"].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-gray-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-500">Laden...</td></tr>
            ) : !activity?.length ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-500">Keine Einträge vorhanden.</td></tr>
            ) : activity.map(a => (
              <tr key={a.id} className="border-b border-[#1e2d4a]/40 hover:bg-[#1a2744]/30">
                <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{new Date(a.timestamp).toLocaleString("de-DE")}</td>
                <td className="px-4 py-2.5 text-gray-200">{a.action}</td>
                <td className="px-4 py-2.5 text-gray-400">{a.agent}</td>
                <td className="px-4 py-2.5 text-[#c9a227] font-mono">{a.caseNumber ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
