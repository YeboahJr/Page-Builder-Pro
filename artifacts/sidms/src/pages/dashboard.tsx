import React, { useState } from "react";
import {
  useGetDashboardStats,
  useGetCases,
  useGetCase,
  useGetCasePersons,
  useGetCaseAgents,
  useGetCaseStatusHistory,
  useCreateCase,
  getGetCasesQueryKey,
  getGetDashboardStatsQueryKey,
  getGetCaseQueryKey,
  getGetCasePersonsQueryKey,
  getGetCaseAgentsQueryKey,
  getGetCaseStatusHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity, FolderOpen, CheckCircle, Eye, Package, AlertTriangle,
  Plus, ChevronRight, RotateCcw, Download, Search
} from "lucide-react";

const PRIORITIES = ["Alle Prioritäten", "Hoch", "Mittel", "Niedrig"];
const STATUSES = ["Alle Status", "Aktiv", "Offen", "Ermittlungen pausiert", "Observation", "An STA übergeben", "Abgeschlossen"];
const CATEGORIES = ["Alle Kategorien", "Drogenkriminalität", "Waffendelikte", "Korruption", "Finanzkriminalität", "Gewaltdelikte", "Cyberkriminalität"];

function priorityBadge(p: string) {
  const map: Record<string, string> = {
    Hoch: "bg-red-900/60 text-red-400 border border-red-700/50",
    Mittel: "bg-orange-900/60 text-orange-400 border border-orange-700/50",
    Niedrig: "bg-green-900/60 text-green-400 border border-green-700/50",
  };
  return map[p] ?? "bg-gray-800 text-gray-400";
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    "Aktiv": "bg-green-900/60 text-green-400 border border-green-700/50",
    "Offen": "bg-gray-700/60 text-gray-300 border border-gray-600/50",
    "Ermittlungen pausiert": "bg-orange-900/60 text-orange-400 border border-orange-700/50",
    "Observation": "bg-blue-900/60 text-blue-400 border border-blue-700/50",
    "An STA übergeben": "bg-purple-900/60 text-purple-400 border border-purple-700/50",
    "Abgeschlossen": "bg-gray-800/60 text-gray-500 border border-gray-700/50",
  };
  return map[s] ?? "bg-gray-800 text-gray-400";
}

export default function Dashboard() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("Übersicht");
  const [showNewCase, setShowNewCase] = useState(false);
  const [filters, setFilters] = useState({
    caseNumber: "", title: "", category: "", status: "", agentId: "", priority: "",
    suspectName: "", vehiclePlate: "", missionNumber: "", dateFrom: "", dateTo: "",
  });

  const { data: stats } = useGetDashboardStats();
  const { data: cases, isLoading: casesLoading } = useGetCases(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v && !v.startsWith("Alle"))) as Record<string, string>
  );
  const { data: caseDetail } = useGetCase(selectedId!, {
    query: { enabled: !!selectedId, queryKey: getGetCaseQueryKey(selectedId ?? 0) }
  });
  const { data: casePersons } = useGetCasePersons(selectedId!, {
    query: { enabled: !!selectedId && activeTab === "Personen", queryKey: getGetCasePersonsQueryKey(selectedId ?? 0) }
  });
  const { data: caseAgents } = useGetCaseAgents(selectedId!, {
    query: { enabled: !!selectedId && activeTab === "Agenten", queryKey: getGetCaseAgentsQueryKey(selectedId ?? 0) }
  });
  const { data: statusHistory } = useGetCaseStatusHistory(selectedId!, {
    query: { enabled: !!selectedId && activeTab === "Übersicht", queryKey: getGetCaseStatusHistoryQueryKey(selectedId ?? 0) }
  });

  const createCase = useCreateCase();

  const statCards = [
    { label: "Aktive Fälle", value: stats?.aktiveFaelle ?? 0, delta: stats?.aktiveFaelleDelta, icon: Activity, color: "text-yellow-400", border: "border-yellow-600/30" },
    { label: "Offene Fälle", value: stats?.offeneFaelle ?? 0, delta: stats?.offeneFaelleDelta, icon: FolderOpen, color: "text-blue-400", border: "border-blue-600/30" },
    { label: "Abgeschlossene Fälle", value: stats?.abgeschlosseneFaelle ?? 0, delta: stats?.abgeschlosseneFaelleDelta, icon: CheckCircle, color: "text-green-400", border: "border-green-600/30" },
    { label: "Observationen", value: stats?.observationen ?? 0, delta: stats?.observationenDelta, icon: Eye, color: "text-purple-400", border: "border-purple-600/30" },
    { label: "Neue Beweismittel", value: stats?.neueBeweismittel ?? 0, delta: stats?.neueBeweismittelDelta, icon: Package, color: "text-cyan-400", border: "border-cyan-600/30" },
    { label: "Hohe Priorität", value: stats?.hohePrioritaet ?? 0, delta: stats?.hohePrioritaetDelta, icon: AlertTriangle, color: "text-red-400", border: "border-red-600/30" },
  ];

  const TABS = ["Übersicht", "Personen", "Agenten", "Einsätze", "Observationen", "Beweismittel", "Fahrzeuge", "ID-Changes", "Dokumente", "Chronologie"];

  const applyFilters = () => {
    qc.invalidateQueries({ queryKey: getGetCasesQueryKey() });
  };

  const resetFilters = () => {
    setFilters({ caseNumber: "", title: "", category: "", status: "", agentId: "", priority: "", suspectName: "", vehiclePlate: "", missionNumber: "", dateFrom: "", dateTo: "" });
  };

  const selectedCase = cases?.find(c => c.id === selectedId);

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Stats row */}
      <div className="grid grid-cols-6 gap-3 flex-shrink-0">
        {statCards.map((s, i) => (
          <div key={i} className={`bg-[#0d1526] border ${s.border} rounded p-3 flex items-start gap-3`} data-testid={`stat-card-${i}`}>
            <div className={`p-2 rounded bg-[#0a0f1a] ${s.color}`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 leading-tight">{s.label}</p>
              <p className="text-2xl font-bold text-white leading-tight">{s.value}</p>
              {s.delta !== undefined && (
                <p className={`text-xs ${(s.delta as number) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {(s.delta as number) >= 0 ? "+" : ""}{s.delta} seit letzter Woche
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Case table + detail */}
        <div className="flex-1 flex flex-col min-w-0 gap-4">
          {/* Case table */}
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d4a]">
              <h2 className="text-sm font-semibold text-white">Fallübersicht</h2>
              <button
                onClick={() => setShowNewCase(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1a3d7c]/60 hover:bg-[#1a3d7c] border border-[#2a5bb0]/50 text-blue-300 rounded transition-colors"
                data-testid="button-new-case"
              >
                <Plus className="w-3.5 h-3.5" />
                Neuer Fall
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e2d4a] bg-[#0a0f1a]">
                    {["Fallnummer", "Titel", "Kategorie", "Priorität", "Status", "Leitender Agent", "Letzte Änderung"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {casesLoading ? (
                    <tr><td colSpan={7} className="text-center py-6 text-gray-500">Laden...</td></tr>
                  ) : cases?.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => { setSelectedId(c.id); setActiveTab("Übersicht"); }}
                      className={`border-b border-[#1e2d4a]/50 cursor-pointer transition-colors hover:bg-[#1a2744]/50 ${selectedId === c.id ? "bg-[#1a2744]" : ""}`}
                      data-testid={`row-case-${c.id}`}
                    >
                      <td className="px-3 py-2 text-gray-300 font-mono whitespace-nowrap">{c.caseNumber}</td>
                      <td className="px-3 py-2 text-white whitespace-nowrap max-w-[160px] truncate">{c.title}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{c.category}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityBadge(c.priority)}`}>{c.priority}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${statusBadge(c.status)}`}>{c.status}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{c.leadAgent}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.lastModified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Case detail */}
          {selectedId && (
            <div className="bg-[#0d1526] border border-[#1e2d4a] rounded flex flex-col">
              <div className="px-4 py-3 border-b border-[#1e2d4a]">
                <p className="text-xs text-gray-400">Fallakte: <span className="text-[#c9a227] font-mono">{selectedCase?.caseNumber}</span> – {selectedCase?.title}</p>
              </div>
              {/* Tabs */}
              <div className="flex border-b border-[#1e2d4a] overflow-x-auto">
                {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-2 text-xs whitespace-nowrap transition-colors ${activeTab === tab ? "text-[#c9a227] border-b-2 border-[#c9a227]" : "text-gray-400 hover:text-white"}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {/* Tab content */}
              <div className="p-4">
                {activeTab === "Übersicht" && caseDetail && (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Allgemeine Informationen</h3>
                      {[
                        ["Fallnummer", caseDetail.caseNumber],
                        ["Titel", caseDetail.title],
                        ["Kategorie", caseDetail.category],
                        ["Priorität", caseDetail.priority],
                        ["Status", caseDetail.status],
                        ["Zuständiger Agent", caseDetail.leadAgent],
                        ["Erstellungsdatum", caseDetail.createdAt],
                        ["Letzte Änderung", caseDetail.lastModified],
                        ["Abschlussdatum", caseDetail.closedAt ?? "–"],
                      ].map(([label, val]) => (
                        <div key={label} className="flex gap-3 text-xs">
                          <span className="text-gray-500 w-36 flex-shrink-0">{label}</span>
                          <span className={`text-gray-200 ${label === "Priorität" ? "" : ""}`}>
                            {label === "Priorität"
                              ? <span className={`px-2 py-0.5 rounded ${priorityBadge(val as string)}`}>{val}</span>
                              : label === "Status"
                              ? <span className={`px-2 py-0.5 rounded ${statusBadge(val as string)}`}>{val}</span>
                              : val}
                          </span>
                        </div>
                      ))}
                      {caseDetail.description && (
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Beschreibung</p>
                          <p className="text-xs text-gray-300">{caseDetail.description}</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Beteiligte Agenten</h3>
                        <p className="text-xs text-gray-300">Leitender Agent: {caseDetail.leadAgent}</p>
                        {(caseDetail.supportingAgents?.length ?? 0) > 0 && (
                          <p className="text-xs text-gray-400 mt-1">Unterstützende Agenten: {caseDetail.supportingAgents?.join(", ")}</p>
                        )}
                        {caseDetail.supervisor && (
                          <p className="text-xs text-gray-400 mt-1">Supervisor: {caseDetail.supervisor}</p>
                        )}
                      </div>
                      {/* Status history */}
                      {statusHistory && statusHistory.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Status-Verlauf</h3>
                          <div className="space-y-2">
                            {statusHistory.slice(0, 4).map(h => (
                              <div key={h.id} className="flex items-start gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#c9a227] mt-1 flex-shrink-0" />
                                <div>
                                  <p className="text-xs text-gray-300">{new Date(h.timestamp).toLocaleString("de-DE")}</p>
                                  <p className="text-xs text-gray-400">Status geändert von <span className="text-white">{h.fromStatus}</span> zu <span className="text-[#c9a227]">{h.toStatus}</span></p>
                                  <p className="text-xs text-gray-500">{h.changedBy}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {activeTab === "Personen" && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Beteiligte Personen</h3>
                    {!casePersons?.length ? (
                      <p className="text-xs text-gray-500">Keine Personen erfasst.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#1e2d4a]">
                            {["Name", "Aktuelle ID", "Frühere IDs", "Rolle", "Letzter Aufenthaltsort"].map(h => (
                              <th key={h} className="text-left px-2 py-1.5 text-gray-400">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {casePersons.map(p => (
                            <tr key={p.id} className="border-b border-[#1e2d4a]/30">
                              <td className="px-2 py-2 text-gray-200">{p.name}</td>
                              <td className="px-2 py-2 text-gray-400 font-mono">{p.currentId}</td>
                              <td className="px-2 py-2 text-gray-500">{p.formerIds ?? "–"}</td>
                              <td className="px-2 py-2 text-gray-400">{p.role}</td>
                              <td className="px-2 py-2 text-gray-500">{p.lastLocation ?? "–"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {activeTab === "Agenten" && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Beteiligte Agenten</h3>
                    {!caseAgents?.length ? (
                      <p className="text-xs text-gray-500">Keine Agenten zugewiesen.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#1e2d4a]">
                            {["Name", "Rolle"].map(h => (
                              <th key={h} className="text-left px-2 py-1.5 text-gray-400">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {caseAgents.map(a => (
                            <tr key={a.id} className="border-b border-[#1e2d4a]/30">
                              <td className="px-2 py-2 text-gray-200">{a.name}</td>
                              <td className="px-2 py-2 text-gray-400">{a.role}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {!["Übersicht", "Personen", "Agenten"].includes(activeTab) && (
                  <p className="text-xs text-gray-500 py-4 text-center">Keine Daten für diesen Bereich vorhanden.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Search & Filter */}
        <div className="w-72 flex-shrink-0 space-y-3">
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">Suche & Filter</h2>
              <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Zurücksetzen
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Fallnummer</label>
                <input
                  value={filters.caseNumber}
                  onChange={e => setFilters(f => ({ ...f, caseNumber: e.target.value }))}
                  placeholder="z.B. SID-2026-0001"
                  className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-[#c9a227]/50"
                  data-testid="input-filter-casenumber"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Titel</label>
                <input
                  value={filters.title}
                  onChange={e => setFilters(f => ({ ...f, title: e.target.value }))}
                  placeholder="Stichwort eingeben"
                  className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-[#c9a227]/50"
                  data-testid="input-filter-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Kategorie</label>
                  <select
                    value={filters.category}
                    onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
                    className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none"
                    data-testid="select-filter-category"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c.startsWith("Alle") ? "" : c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Status</label>
                  <select
                    value={filters.status}
                    onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                    className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none"
                    data-testid="select-filter-status"
                  >
                    {STATUSES.map(s => <option key={s} value={s.startsWith("Alle") ? "" : s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Priorität</label>
                <select
                  value={filters.priority}
                  onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
                  className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none"
                  data-testid="select-filter-priority"
                >
                  {PRIORITIES.map(p => <option key={p} value={p.startsWith("Alle") ? "" : p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Verdächtiger / Person</label>
                <input
                  value={filters.suspectName}
                  onChange={e => setFilters(f => ({ ...f, suspectName: e.target.value }))}
                  placeholder="Name oder ID eingeben"
                  className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-[#c9a227]/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Fahrzeug / Kennzeichen</label>
                <input
                  value={filters.vehiclePlate}
                  onChange={e => setFilters(f => ({ ...f, vehiclePlate: e.target.value }))}
                  placeholder="Kennzeichen eingeben"
                  className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-[#c9a227]/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Einsatznummer</label>
                <input
                  value={filters.missionNumber}
                  onChange={e => setFilters(f => ({ ...f, missionNumber: e.target.value }))}
                  placeholder="Einsatznummer eingeben"
                  className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-[#c9a227]/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Datum von</label>
                  <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                    className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Datum bis</label>
                  <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                    className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={applyFilters}
                  className="flex-1 bg-[#1a3d7c] hover:bg-[#1e4a94] text-white text-xs py-2 rounded font-medium transition-colors"
                  data-testid="button-apply-filters"
                >
                  Filter anwenden
                </button>
                <button className="flex items-center gap-1 px-2 py-2 bg-[#1e2d4a] hover:bg-[#253650] text-gray-300 text-xs rounded transition-colors">
                  <Download className="w-3 h-3" /> Exportieren
                </button>
              </div>
            </div>
          </div>

          {/* Links / Verknüpfungen */}
          {selectedId && (
            <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-4">
              <h3 className="text-xs font-semibold text-white mb-2">Verknüpfungen</h3>
              {[
                { label: "Personalverwaltung", color: "bg-green-500" },
                { label: "Streifenverwaltung", color: "bg-blue-500" },
                { label: "ID-Change-System", color: "bg-yellow-500" },
                { label: "Audit-Log", color: "bg-purple-500" },
                { label: "Archiv", color: "bg-gray-500" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2 py-1">
                  <span className={`w-2 h-2 rounded-full ${l.color}`} />
                  <span className="text-xs text-gray-300 hover:text-[#c9a227] cursor-pointer transition-colors">{l.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
