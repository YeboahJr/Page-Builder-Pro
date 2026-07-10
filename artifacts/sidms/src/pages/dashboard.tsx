import React, { useState } from "react";
import {
  useGetDashboardStats,
  useCreateCase,
  useGetOfficerNames,
  getGetCasesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity, FolderOpen, CheckCircle, Package, AlertTriangle, X
} from "lucide-react";
import EvidenceUpload, { type UploadFile, uploadEvidenceFiles, allDescriptionsFilled } from "@/components/EvidenceUpload";
import CaseOverview from "@/components/CaseOverview";
import { STRAFTATEN } from "@/lib/straftaten";

const CATEGORIES_NEW = ["Gang", "Familie"];
const PRIORITIES_NEW = ["Hoch", "Mittel", "Niedrig"];
const STATUSES_NEW = ["Aktiv", "Offen", "Ermittlungen pausiert", "An STA übergeben", "Abgeschlossen"];
const VERHANDLUNGSFUEHRUNG_OPTIONS = ["Federal Investigation Bureau", "San Andreas Highway Patrol", "Los Santos Police Department"];
interface NewCaseForm {
  caseNumber: string; title: string; category: string; priority: string; status: string; leadAgent: string;
  description: string; details: string;
  verhandlungsfuehrung: string; straftaten: string[]; tatDatum: string; tatWann: string; tatWo: string; tatWer: string;
  geiseln: string; forderungen: string;
}
const EMPTY_NEW_CASE: NewCaseForm = {
  caseNumber: "", title: "", category: "Gang", priority: "Mittel", status: "Offen", leadAgent: "", description: "", details: "",
  verhandlungsfuehrung: "Federal Investigation Bureau", straftaten: [], tatDatum: "", tatWann: "", tatWo: "", tatWer: "",
  geiseln: "", forderungen: "",
};

export default function Dashboard() {
  const qc = useQueryClient();
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCaseForm, setNewCaseForm] = useState<NewCaseForm>(EMPTY_NEW_CASE);
  const [newCaseFiles, setNewCaseFiles] = useState<UploadFile[]>([]);
  const [newCaseSubmitting, setNewCaseSubmitting] = useState(false);
  const [newCaseError, setNewCaseError] = useState<string | null>(null);
  const [straftatenOpen, setStraftatenOpen] = useState(false);

  const { data: stats } = useGetDashboardStats();
  const createCase = useCreateCase();
  const { data: allOfficers } = useGetOfficerNames();
  const officerNames = [...new Set((allOfficers ?? []).map(o => o.name))].sort((a, b) => a.localeCompare(b, "de"));

  const handleNewCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewCaseSubmitting(true);
    setNewCaseError(null);
    try {
      const created = await createCase.mutateAsync({ data: newCaseForm });
      if (newCaseFiles.length > 0) {
        await uploadEvidenceFiles((created as { id: number }).id, newCaseFiles);
      }
      qc.invalidateQueries({ queryKey: getGetCasesQueryKey() });
      setShowNewCase(false);
      setNewCaseForm(EMPTY_NEW_CASE);
      setStraftatenOpen(false);
      setNewCaseFiles([]);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setNewCaseError(e2?.response?.data?.error ?? "Fall konnte nicht angelegt werden");
    } finally { setNewCaseSubmitting(false); }
  };

  const statCards = [
    { label: "Aktive Fälle", value: stats?.aktiveFaelle ?? 0, delta: stats?.aktiveFaelleDelta, icon: Activity, color: "text-yellow-400", border: "border-yellow-600/30" },
    { label: "Offene Fälle", value: stats?.offeneFaelle ?? 0, delta: stats?.offeneFaelleDelta, icon: FolderOpen, color: "text-blue-400", border: "border-blue-600/30" },
    { label: "Abgeschlossene Fälle", value: stats?.abgeschlosseneFaelle ?? 0, delta: stats?.abgeschlosseneFaelleDelta, icon: CheckCircle, color: "text-green-400", border: "border-green-600/30" },
    { label: "Neue Beweismittel", value: stats?.neueBeweismittel ?? 0, delta: stats?.neueBeweismittelDelta, icon: Package, color: "text-cyan-400", border: "border-cyan-600/30" },
    { label: "Hohe Priorität", value: stats?.hohePrioritaet ?? 0, delta: stats?.hohePrioritaetDelta, icon: AlertTriangle, color: "text-red-400", border: "border-red-600/30" },
  ];

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* New Case Modal */}
      {showNewCase && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a] sticky top-0 bg-[#0d1526]">
              <h2 className="text-sm font-semibold text-white">Neuer Fall anlegen</h2>
              <button onClick={() => { setShowNewCase(false); setStraftatenOpen(false); }} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleNewCase} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Fallnummer</label>
                  <input value={newCaseForm.caseNumber} onChange={e => setNewCaseForm(f => ({ ...f, caseNumber: e.target.value }))} placeholder="Leer lassen für automatische Vergabe" className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50 font-mono" data-testid="input-case-number" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Titel *</label>
                  <input required value={newCaseForm.title} onChange={e => setNewCaseForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Kategorie</label>
                  <select value={newCaseForm.category} onChange={e => setNewCaseForm(f => ({ ...f, category: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none">
                    {CATEGORIES_NEW.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Priorität</label>
                  <select value={newCaseForm.priority} onChange={e => setNewCaseForm(f => ({ ...f, priority: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none">
                    {PRIORITIES_NEW.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Status</label>
                  <select value={newCaseForm.status} onChange={e => setNewCaseForm(f => ({ ...f, status: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none">
                    {STATUSES_NEW.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Leitender Agent *</label>
                  <select required value={newCaseForm.leadAgent} onChange={e => setNewCaseForm(f => ({ ...f, leadAgent: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="select-lead-agent-dashboard">
                    <option value="" disabled>Officer auswählen…</option>
                    {newCaseForm.leadAgent && !officerNames.includes(newCaseForm.leadAgent) && <option value={newCaseForm.leadAgent}>{newCaseForm.leadAgent}</option>}
                    {officerNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Verhandlungsführung</label>
                  <select value={newCaseForm.verhandlungsfuehrung} onChange={e => setNewCaseForm(f => ({ ...f, verhandlungsfuehrung: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none" data-testid="select-verhandlungsfuehrung">
                    {VERHANDLUNGSFUEHRUNG_OPTIONS.map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div className="relative">
                  <label className="text-xs text-gray-400 block mb-1">Vorgeworfene Straftaten</label>
                  <button
                    type="button"
                    onClick={() => setStraftatenOpen(v => !v)}
                    className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none text-left flex items-center justify-between gap-2"
                    data-testid="button-straftaten-dropdown"
                  >
                    <span className={`truncate ${newCaseForm.straftaten.length === 0 ? "text-gray-500" : ""}`}>
                      {newCaseForm.straftaten.length === 0 ? "Auswählen…" : `${newCaseForm.straftaten.length} ausgewählt`}
                    </span>
                    <span className="text-gray-500 flex-shrink-0">▾</span>
                  </button>
                  {straftatenOpen && (
                    <div className="absolute z-20 mt-1 w-[28rem] max-w-[80vw] max-h-64 overflow-y-auto bg-[#0a0f1a] border border-[#1e2d4a] rounded shadow-2xl p-2 space-y-0.5" data-testid="dropdown-straftaten">
                      {STRAFTATEN.map(s => (
                        <label key={s} className="flex items-start gap-2 px-2 py-1 rounded hover:bg-[#1a2744]/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newCaseForm.straftaten.includes(s)}
                            onChange={e => setNewCaseForm(f => ({
                              ...f,
                              straftaten: e.target.checked ? [...f.straftaten, s] : f.straftaten.filter(x => x !== s),
                            }))}
                            className="mt-0.5 accent-[#c9a227]"
                          />
                          <span className="text-xs text-gray-300">{s}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {newCaseForm.straftaten.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {newCaseForm.straftaten.map(s => (
                        <span key={s} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#1a2744] border border-[#1e2d4a] rounded text-[10px] text-gray-300">
                          {s.split(" – ")[0]}
                          <button type="button" onClick={() => setNewCaseForm(f => ({ ...f, straftaten: f.straftaten.filter(x => x !== s) }))} className="text-gray-500 hover:text-red-400">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Datum</label>
                  <input type="date" value={newCaseForm.tatDatum} onChange={e => setNewCaseForm(f => ({ ...f, tatDatum: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="input-tat-datum" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Wann</label>
                  <input value={newCaseForm.tatWann} onChange={e => setNewCaseForm(f => ({ ...f, tatWann: e.target.value }))} placeholder="z. B. 21:30 Uhr" className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="input-tat-wann" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Wo</label>
                  <input value={newCaseForm.tatWo} onChange={e => setNewCaseForm(f => ({ ...f, tatWo: e.target.value }))} placeholder="Ort" className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="input-tat-wo" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Wer</label>
                  <input value={newCaseForm.tatWer} onChange={e => setNewCaseForm(f => ({ ...f, tatWer: e.target.value }))} placeholder="Beteiligte Personen" className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="input-tat-wer" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Geiseln</label>
                  <input value={newCaseForm.geiseln} onChange={e => setNewCaseForm(f => ({ ...f, geiseln: e.target.value }))} placeholder="Geiseln" className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="input-geiseln" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Forderungen</label>
                  <input value={newCaseForm.forderungen} onChange={e => setNewCaseForm(f => ({ ...f, forderungen: e.target.value }))} placeholder="Forderungen" className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="input-forderungen" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Beschreibung</label>
                  <textarea value={newCaseForm.description} onChange={e => setNewCaseForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50 resize-none" data-testid="textarea-beschreibung" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Details</label>
                  <textarea value={newCaseForm.details} onChange={e => setNewCaseForm(f => ({ ...f, details: e.target.value }))} rows={3} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50 resize-none" data-testid="textarea-details" />
                </div>
                <div className="col-span-2">
                  <EvidenceUpload files={newCaseFiles} onChange={setNewCaseFiles} />
                </div>
              </div>
              {newCaseError && (
                <p className="text-xs text-red-400" data-testid="text-new-case-error">{newCaseError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowNewCase(false); setStraftatenOpen(false); setNewCaseError(null); }} className="flex-1 py-2 bg-[#1e2d4a] text-gray-300 text-sm rounded transition-colors hover:bg-[#253650]">Abbrechen</button>
                <button type="submit" disabled={newCaseSubmitting || !allDescriptionsFilled(newCaseFiles)} className="flex-1 py-2 bg-[#1a3d7c] hover:bg-[#1e4a94] text-white text-sm font-medium rounded transition-colors disabled:opacity-60">
                  {newCaseSubmitting ? "Anlegen..." : "Fall anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3 flex-shrink-0">
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
      <CaseOverview onNewCase={() => setShowNewCase(true)} />
    </div>
  );
}
