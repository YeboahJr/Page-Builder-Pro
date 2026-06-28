import React, { useState } from "react";
import { useGetCases, useCreateCase, useUpdateCase, useDeleteCase, getGetCasesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit3, X } from "lucide-react";
import EvidenceUpload, { type UploadFile, uploadEvidenceFiles } from "@/components/EvidenceUpload";

function priorityBadge(p: string) {
  const map: Record<string, string> = { Hoch: "bg-red-900/60 text-red-400 border border-red-700/50", Mittel: "bg-orange-900/60 text-orange-400 border border-orange-700/50", Niedrig: "bg-green-900/60 text-green-400 border border-green-700/50" };
  return map[p] ?? "bg-gray-800 text-gray-400";
}
function statusBadge(s: string) {
  const map: Record<string, string> = { Aktiv: "bg-green-900/60 text-green-400 border border-green-700/50", Offen: "bg-gray-700/60 text-gray-300 border border-gray-600/50", "Ermittlungen pausiert": "bg-orange-900/60 text-orange-400 border border-orange-700/50", Observation: "bg-blue-900/60 text-blue-400 border border-blue-700/50", "An STA übergeben": "bg-purple-900/60 text-purple-400 border border-purple-700/50", Abgeschlossen: "bg-gray-800/60 text-gray-500 border border-gray-700/50" };
  return map[s] ?? "bg-gray-800 text-gray-400";
}

const CATEGORIES = ["Drogenkriminalität", "Waffendelikte", "Korruption", "Finanzkriminalität", "Gewaltdelikte", "Cyberkriminalität"];
const PRIORITIES = ["Hoch", "Mittel", "Niedrig"];
const STATUSES = ["Aktiv", "Offen", "Ermittlungen pausiert", "Observation", "An STA übergeben", "Abgeschlossen"];

interface CaseForm { title: string; category: string; priority: string; status: string; leadAgent: string; description: string; }

export default function Fallmanagement() {
  const qc = useQueryClient();
  const { data: cases, isLoading } = useGetCases();
  const createCase = useCreateCase();
  const deleteCase = useDeleteCase();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CaseForm>({ title: "", category: "Drogenkriminalität", priority: "Mittel", status: "Offen", leadAgent: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const newCase = await createCase.mutateAsync({ data: form });
      if (uploadFiles.length > 0) {
        await uploadEvidenceFiles((newCase as { id: number }).id, uploadFiles);
      }
      qc.invalidateQueries({ queryKey: getGetCasesQueryKey() });
      setShowForm(false);
      setForm({ title: "", category: "Drogenkriminalität", priority: "Mittel", status: "Offen", leadAgent: "", description: "" });
      setUploadFiles([]);
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Fall wirklich löschen?")) return;
    await deleteCase.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getGetCasesQueryKey() });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Fallmanagement</h1>
          <p className="text-xs text-gray-400">Übersicht und Verwaltung aller Fälle.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 bg-[#1a3d7c] hover:bg-[#1e4a94] border border-[#2a5bb0] text-white text-sm font-medium rounded transition-colors" data-testid="button-new-case-fallmanagement">
          <Plus className="w-4 h-4" /> Neuer Fall
        </button>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded-lg w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a]">
              <h2 className="text-sm font-semibold text-white">Neuer Fall anlegen</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Titel *</label>
                  <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Kategorie</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Priorität</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none">
                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none">
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Leitender Agent *</label>
                  <input required value={form.leadAgent} onChange={e => setForm(f => ({ ...f, leadAgent: e.target.value }))} placeholder="z.B. SA Michael Harper" className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Beschreibung</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50 resize-none" />
                </div>
                <div className="col-span-2">
                  <EvidenceUpload files={uploadFiles} onChange={setUploadFiles} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 bg-[#1e2d4a] text-gray-300 text-sm rounded transition-colors hover:bg-[#253650]">Abbrechen</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2 bg-[#1a3d7c] hover:bg-[#1e4a94] text-white text-sm font-medium rounded transition-colors disabled:opacity-60" data-testid="button-submit-new-case">
                  {submitting ? "Anlegen..." : "Fall anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cases table */}
      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#0a0f1a] border-b border-[#1e2d4a]">
              {["Fallnummer", "Titel", "Kategorie", "Priorität", "Status", "Leitender Agent", "Letzte Änderung", "Aktionen"].map(h => (
                <th key={h} className="text-left px-3 py-2.5 text-gray-400 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-500">Laden...</td></tr>
            ) : cases?.map(c => (
              <tr key={c.id} className="border-b border-[#1e2d4a]/40 hover:bg-[#1a2744]/30 transition-colors" data-testid={`case-row-${c.id}`}>
                <td className="px-3 py-2.5 text-[#c9a227] font-mono whitespace-nowrap">{c.caseNumber}</td>
                <td className="px-3 py-2.5 text-white max-w-[180px] truncate">{c.title}</td>
                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{c.category}</td>
                <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityBadge(c.priority)}`}>{c.priority}</span></td>
                <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${statusBadge(c.status)}`}>{c.status}</span></td>
                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{c.leadAgent}</td>
                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{c.lastModified}</td>
                <td className="px-3 py-2.5">
                  <button onClick={() => handleDelete(c.id)} className="text-gray-500 hover:text-red-400 transition-colors" data-testid={`button-delete-case-${c.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
