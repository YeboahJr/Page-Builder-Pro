import React, { useState } from "react";
import { useGetEvidence, useCreateEvidence, useGetCases, getGetEvidenceQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X, Package } from "lucide-react";

const EVIDENCE_TYPES = ["Elektronik", "Drogen", "Waffe", "Dokumente", "Fahrzeug", "Sonstiges"];

export default function Beweismittel() {
  const qc = useQueryClient();
  const { data: evidence, isLoading } = useGetEvidence();
  const { data: cases } = useGetCases();
  const createEvidence = useCreateEvidence();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", type: "Sonstiges", description: "", caseId: 0 });
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.caseId) return;
    setSubmitting(true);
    try {
      await createEvidence.mutateAsync({ data: { title: form.title, type: form.type, description: form.description, caseId: form.caseId } });
      qc.invalidateQueries({ queryKey: getGetEvidenceQueryKey() });
      setShowForm(false);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Beweismittel</h1>
          <p className="text-xs text-gray-400">Verwaltung aller sichergestellten Beweismittel.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 bg-[#1a3d7c] hover:bg-[#1e4a94] border border-[#2a5bb0] text-white text-sm font-medium rounded" data-testid="button-new-evidence">
          <Plus className="w-4 h-4" /> Neues Beweismittel
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a]">
              <h2 className="text-sm font-semibold text-white">Beweismittel hinzufügen</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Titel *</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Typ</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none">
                  {EVIDENCE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Fall *</label>
                <select required value={form.caseId || ""} onChange={e => setForm(f => ({ ...f, caseId: parseInt(e.target.value) }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none">
                  <option value="">Fall auswählen</option>
                  {cases?.map(c => <option key={c.id} value={c.id}>{c.caseNumber} – {c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Beschreibung</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 bg-[#1e2d4a] text-gray-300 text-sm rounded">Abbrechen</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2 bg-[#1a3d7c] text-white text-sm font-medium rounded disabled:opacity-60">
                  {submitting ? "Speichern..." : "Hinzufügen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#0a0f1a] border-b border-[#1e2d4a]">
              {["ID", "Titel", "Typ", "Fallnummer", "Hinzugefügt am", "Hinzugefügt von"].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-gray-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Laden...</td></tr>
            ) : !evidence?.length ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Keine Beweismittel vorhanden.</td></tr>
            ) : evidence.map(e => (
              <tr key={e.id} className="border-b border-[#1e2d4a]/40 hover:bg-[#1a2744]/30">
                <td className="px-4 py-2.5 text-gray-500">#{e.id}</td>
                <td className="px-4 py-2.5 text-white">{e.title}</td>
                <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded bg-[#1e2d4a] text-gray-300">{e.type}</span></td>
                <td className="px-4 py-2.5 text-[#c9a227] font-mono">{e.caseNumber}</td>
                <td className="px-4 py-2.5 text-gray-400">{new Date(e.addedAt).toLocaleDateString("de-DE")}</td>
                <td className="px-4 py-2.5 text-gray-400">{e.addedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
