import React, { useState } from "react";
import {
  useGetReports,
  useGetReportStats,
  useGetReport,
  useCreateReport,
  getGetReportsQueryKey,
  getGetReportQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Users, AlertTriangle, MessageSquare, CheckCircle, ChevronRight, Circle, Wifi, Monitor } from "lucide-react";

const typeBorderColor: Record<string, string> = {
  "GEISELNAHME": "border-l-red-600",
  "SCHUSSWAFFEN EINSATZ": "border-l-orange-500",
  "VERDÄCHTIGE PERSON": "border-l-yellow-500",
  "VERKEHRSUNFALL": "border-l-yellow-600",
  "EINBRUCH / ALARM": "border-l-green-600",
  "TÄTLICHER ANGRIFF": "border-l-red-700",
};

const typeBadgeColor: Record<string, string> = {
  "GEISELNAHME": "text-red-400 bg-red-900/30 border border-red-700/40",
  "SCHUSSWAFFEN EINSATZ": "text-orange-400 bg-orange-900/30 border border-orange-700/40",
  "VERDÄCHTIGE PERSON": "text-yellow-400 bg-yellow-900/30 border border-yellow-700/40",
  "VERKEHRSUNFALL": "text-yellow-400 bg-yellow-900/30 border border-yellow-600/40",
  "EINBRUCH / ALARM": "text-green-400 bg-green-900/30 border border-green-700/40",
};

const priorityColor: Record<string, string> = {
  Kritisch: "text-red-400",
  Hoch: "text-orange-400",
  Mittel: "text-yellow-400",
  Niedrig: "text-green-400",
};

const statusColor: Record<string, string> = {
  "In Bearbeitung": "text-yellow-400 bg-yellow-900/30 border border-yellow-700/40",
  "Unterwegs": "text-blue-400 bg-blue-900/30 border border-blue-700/40",
  "Überprüfung": "text-purple-400 bg-purple-900/30 border border-purple-700/40",
  "Abgeschlossen": "text-gray-400 bg-gray-800/50 border border-gray-600/30",
};

const pastReports = [
  { time: "21:30", priority: "Niedrig", type: "Ruhestörung", msg: "Laute Musik / Ruhestörung", location: "Mirror Park Blvd, Mirror Park", status: "Abgeschlossen" },
  { time: "21:22", priority: "Mittel", type: "Verkehrsunfall", msg: "Fahrzeug prallt gegen Laterne", location: "Davis Ave, Davis", status: "Abgeschlossen" },
  { time: "21:15", priority: "Niedrig", type: "Fundmeldung", msg: "Verdächtiges Paket gefunden", location: "La Puerta Fwy, La Puerta", status: "Abgeschlossen" },
  { time: "21:08", priority: "Mittel", type: "Streitigkeiten", msg: "Körperliche Auseinandersetzung", location: "Bay City Ave, Del Perro", status: "Abgeschlossen" },
  { time: "20:55", priority: "Niedrig", type: "Tierrettung", msg: "Verletztes Tier gemeldet", location: "Zancudo Ave, Sandy Shores", status: "Abgeschlossen" },
];

export default function Meldungen() {
  const { data: stats } = useGetReportStats();
  const { data: reports } = useGetReports();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: selectedReport } = useGetReport(selectedId!, { query: { enabled: !!selectedId, queryKey: getGetReportQueryKey(selectedId ?? 0) } });

  const activeReports = reports?.filter(r => r.status !== "Abgeschlossen") ?? [];
  const criticalReport = reports?.find(r => r.priority === "Kritisch" && r.status !== "Abgeschlossen");

  const statCards = [
    { label: "Aktive Notfälle", value: stats?.aktiveNotfaelle ?? 0, delta: stats?.aktiveNotfaelleDelta, icon: AlertCircle, color: "text-red-400 bg-red-900/20", border: "border-red-600/30" },
    { label: "Geiselnahmen", value: stats?.geiselnahmen ?? 0, delta: stats?.geiselnahmenStatus, icon: Users, color: "text-orange-400 bg-orange-900/20", border: "border-orange-600/30" },
    { label: "Hohe Priorität", value: stats?.hohePrioritaet ?? 0, delta: stats?.hohePrioritaetDelta, icon: AlertTriangle, color: "text-yellow-400 bg-yellow-900/20", border: "border-yellow-600/30" },
    { label: "Offene Meldungen", value: stats?.offeneMeldungen ?? 0, delta: stats?.offeneMeldungenDelta, icon: MessageSquare, color: "text-blue-400 bg-blue-900/20", border: "border-blue-600/30" },
    { label: "Abgeschlossene", value: stats?.abgeschlossene ?? 0, delta: stats?.abgeschlosseneDelta, icon: CheckCircle, color: "text-green-400 bg-green-900/20", border: "border-green-600/30" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-white">Leitstelle – Meldungen</h1>
        <p className="text-xs text-gray-400">Aktuelle Meldungen, Warnungen und wichtige Informationen.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {statCards.map((s, i) => (
          <div key={i} className={`bg-[#0d1526] border ${s.border} rounded p-3 flex items-start gap-3`}>
            <div className={`p-2 rounded ${s.color}`}><s.icon className="w-4 h-4" /></div>
            <div>
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-gray-500">{s.delta}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Main reports list */}
        <div className="col-span-2 space-y-4">
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded">
            <div className="px-4 py-3 border-b border-[#1e2d4a]">
              <h2 className="text-sm font-semibold text-white">Aktuelle Notfallmeldungen</h2>
            </div>
            <div className="divide-y divide-[#1e2d4a]/50">
              {activeReports.map(r => (
                <div
                  key={r.id}
                  className={`p-4 flex items-start border-l-4 ${typeBorderColor[r.type] ?? "border-l-gray-600"} cursor-pointer hover:bg-[#1a2744]/30 transition-colors ${selectedId === r.id ? "bg-[#1a2744]/50" : ""}`}
                  onClick={() => setSelectedId(r.id)}
                  data-testid={`report-item-${r.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${typeBadgeColor[r.type] ?? "text-gray-400"}`}>{r.type}</span>
                    </div>
                    <p className="text-sm font-semibold text-white">{r.title}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <span className="text-gray-500">@</span> {r.location}
                    </p>
                    {r.description && <p className="text-xs text-gray-500 mt-1 truncate">{r.description}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 ml-4 flex-shrink-0 text-xs">
                    <div className="text-right">
                      <span className="text-gray-400">Priorität</span>
                      <p className={`font-semibold ${priorityColor[r.priority] ?? "text-gray-300"}`}>{r.priority}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-400">Meldungszeit</span>
                      <p className="text-gray-300">{new Date(r.reportedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-400">Status</span>
                      <p className={`px-1.5 py-0.5 rounded text-xs ${statusColor[r.status] ?? "text-gray-400"}`}>{r.status}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-400">Einsatzkräfte</span>
                      <p className="text-white font-medium">{r.units} Einheiten</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-500 ml-2 mt-1 flex-shrink-0" />
                </div>
              ))}
              {activeReports.length === 0 && (
                <p className="text-center py-8 text-xs text-gray-500">Keine aktiven Notfallmeldungen</p>
              )}
            </div>
          </div>

          {/* Past reports table */}
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded">
            <div className="px-4 py-3 border-b border-[#1e2d4a]">
              <h2 className="text-sm font-semibold text-white">Letzte Meldungen</h2>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#0a0f1a] border-b border-[#1e2d4a]">
                  {["Zeit", "Priorität", "Typ", "Meldung", "Ort", "Status"].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pastReports.map((r, i) => (
                  <tr key={i} className="border-b border-[#1e2d4a]/30 hover:bg-[#1a2744]/20">
                    <td className="px-3 py-2 text-gray-300">{r.time}</td>
                    <td className="px-3 py-2">
                      <span className={`font-medium ${priorityColor[r.priority] ?? "text-gray-300"}`}>{r.priority}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-400">{r.type}</td>
                    <td className="px-3 py-2 text-gray-300">{r.msg}</td>
                    <td className="px-3 py-2 text-gray-500 truncate max-w-[140px]">{r.location}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400">{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-[#1e2d4a]">
              <button className="text-xs text-gray-400 hover:text-white transition-colors w-full text-center">Alle Meldungen anzeigen</button>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Critical incident */}
          {criticalReport ? (
            <div className="bg-[#0d1526] border border-red-700/40 rounded">
              <div className="px-4 py-3 border-b border-red-700/30 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Aktuelle kritische Lage</h2>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${typeBadgeColor[criticalReport.type] ?? "text-gray-400"}`}>{criticalReport.type}</span>
                  <span className="text-xs text-red-400 bg-red-900/30 border border-red-700/40 px-2 py-0.5 rounded font-bold ml-auto">IN BEARBEITUNG</span>
                </div>
                <p className="text-sm font-semibold text-white">{criticalReport.title}</p>
                <p className="text-xs text-gray-400">@ {criticalReport.location}</p>
                {criticalReport.description && <p className="text-xs text-gray-400">{criticalReport.description}</p>}
                <div className="space-y-2 mt-3">
                  {[
                    ["Tatlage", criticalReport.description ?? "–"],
                    ["Priorität", criticalReport.priority],
                    ["Meldungszeit", new Date(criticalReport.reportedAt).toLocaleString("de-DE")],
                    ["Status", criticalReport.status],
                    ["Einsatzkräfte", `${criticalReport.units} Einheiten vor Ort`],
                    ["Leitender Supervisor", "Noch nicht zugewiesen"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start gap-2 text-xs">
                      <span className="text-gray-500 w-36 flex-shrink-0">{k}</span>
                      <span className="text-gray-300">{v}</span>
                    </div>
                  ))}
                </div>
                <button className="w-full mt-2 bg-[#1a2744] hover:bg-[#1e2d4a] border border-[#1e2d4a] text-gray-300 text-xs py-2 rounded transition-colors">
                  Weitere Details anzeigen
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-4">
              <h2 className="text-sm font-semibold text-white mb-2">Aktuelle kritische Lage</h2>
              <p className="text-xs text-gray-500">Keine kritische Lage aktiv.</p>
            </div>
          )}

          {/* Wichtige Informationen */}
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Wichtige Informationen</h3>
            <div className="space-y-2">
              {[
                "Erhöhte Polizeipräsenz in der Innenstadt aufgrund mehrerer Vorfälle.",
                "Meiden Sie das Gebiet um Pillbox Hill.",
                "Alle Einheiten bleiben einsatzbereit.",
                "Falls Hinweise zu aktuellen Vorfällen vorliegen, kontaktieren Sie die Leitstelle.",
              ].map((info, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <div className="w-4 h-4 rounded-full bg-blue-900/40 border border-blue-700/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-blue-400 text-xs">i</span>
                  </div>
                  <span className="text-gray-300">{info}</span>
                </div>
              ))}
            </div>
          </div>

          {/* System info */}
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Systeminformationen</h3>
            <div className="space-y-2">
              {[
                { label: "Leitstelle Status", value: stats?.leitstelleStatus ?? "Online", icon: Circle, good: true },
                { label: "Funkverbindung", value: stats?.funkverbindung ?? "Stabil", icon: Wifi, good: true },
                { label: "CAD System", value: stats?.cadSystem ?? "Online", icon: Monitor, good: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-gray-400">
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </div>
                  <span className={item.good ? "text-green-400 font-medium" : "text-red-400 font-medium"}>{item.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-[#1e2d4a]">
                <span className="text-gray-400">Letzte Systemaktualisierung</span>
                <span className="text-gray-300">{stats?.letzteAktualisierung ? new Date(stats.letzteAktualisierung).toLocaleString("de-DE") : "–"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
