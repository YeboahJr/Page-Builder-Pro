import React, { useState } from "react";
import { useGetCases, useCreateCase, useUpdateCase, useDeleteCase, getGetCasesQueryKey, getGetCaseQueryKey, getGetCaseAgentsQueryKey, useGetOfficerNames } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit3, X } from "lucide-react";
import EvidenceUpload, { type UploadFile, uploadEvidenceFiles } from "@/components/EvidenceUpload";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";

type CaseRow = { id: number; caseNumber: string; title: string };

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
  const { data: officers } = useGetOfficerNames();
  const officerNames = [...new Set((officers ?? []).map(o => o.name))].sort((a, b) => a.localeCompare(b, "de"));
  const createCase = useCreateCase();
  const updateCase = useUpdateCase();
  const deleteCase = useDeleteCase();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CaseForm>({ title: "", category: "Drogenkriminalität", priority: "Mittel", status: "Offen", leadAgent: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<CaseRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
    setForm({ title: "", category: "Drogenkriminalität", priority: "Mittel", status: "Offen", leadAgent: "", description: "" });
    setUploadFiles([]);
  };

  const openEdit = (c: { id: number; title: string; category: string; priority: string; status: string; leadAgent: string; description?: string | null }) => {
    setEditingId(c.id);
    setFormError(null);
    setForm({
      title: c.title,
      category: c.category,
      priority: c.priority,
      status: c.status,
      leadAgent: c.leadAgent,
      description: c.description ?? "",
    });
    setUploadFiles([]);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editingId !== null) {
        await updateCase.mutateAsync({ id: editingId, data: form });
        qc.invalidateQueries({ queryKey: getGetCaseQueryKey(editingId) });
        qc.invalidateQueries({ queryKey: getGetCaseAgentsQueryKey(editingId) });
      } else {
        const newCase = await createCase.mutateAsync({ data: form });
        if (uploadFiles.length > 0) {
          await uploadEvidenceFiles((newCase as { id: number }).id, uploadFiles);
        }
      }
      qc.invalidateQueries({ queryKey: getGetCasesQueryKey() });
      closeForm();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(msg ?? (editingId !== null ? "Fall konnte nicht gespeichert werden." : "Fall konnte nicht angelegt werden."));
    } finally { setSubmitting(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCase.mutateAsync({ id: deleteTarget.id });
      qc.invalidateQueries({ queryKey: getGetCasesQueryKey() });
      setDeleteTarget(null);
    } catch {
      setDeleteError("Löschen fehlgeschlagen — bitte erneut versuchen.");
    } finally {
      setDeleting(false);
    }
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
              <h2 className="text-sm font-semibold text-white">{editingId !== null ? "Fall bearbeiten" : "Neuer Fall anlegen"}</h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
                  <select required value={form.leadAgent} onChange={e => setForm(f => ({ ...f, leadAgent: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="select-lead-agent">
                    <option value="" disabled>Officer auswählen…</option>
                    {form.leadAgent && !officerNames.includes(form.leadAgent) && <option value={form.leadAgent}>{form.leadAgent}</option>}
                    {officerNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Beschreibung</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50 resize-none" />
                </div>
                {editingId === null && (
                  <div className="col-span-2">
                    <EvidenceUpload files={uploadFiles} onChange={setUploadFiles} />
                  </div>
                )}
              </div>
              {formError && <p className="text-xs text-red-400" data-testid="text-case-form-error">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="flex-1 py-2 bg-[#1e2d4a] text-gray-300 text-sm rounded transition-colors hover:bg-[#253650]">Abbrechen</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2 bg-[#1a3d7c] hover:bg-[#1e4a94] text-white text-sm font-medium rounded transition-colors disabled:opacity-60" data-testid={editingId !== null ? "button-submit-edit-case" : "button-submit-new-case"}>
                  {submitting ? "Speichern..." : editingId !== null ? "Änderungen speichern" : "Fall anlegen"}
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
            ) : !cases || cases.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500" data-testid="text-no-cases">
                  Keine Fälle vorhanden. Es werden nur Fälle angezeigt, an denen Sie beteiligt sind.
                </td>
              </tr>
            ) : cases.map(c => (
              <tr key={c.id} className="border-b border-[#1e2d4a]/40 hover:bg-[#1a2744]/30 transition-colors" data-testid={`case-row-${c.id}`}>
                <td className="px-3 py-2.5 text-[#c9a227] font-mono whitespace-nowrap">{c.caseNumber}</td>
                <td className="px-3 py-2.5 text-white max-w-[180px] truncate">{c.title}</td>
                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{c.category}</td>
                <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityBadge(c.priority)}`}>{c.priority}</span></td>
                <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${statusBadge(c.status)}`}>{c.status}</span></td>
                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{c.leadAgent}</td>
                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{c.lastModified}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(c)} title="Fall bearbeiten" className="text-gray-500 hover:text-[#c9a227] transition-colors" data-testid={`button-edit-case-${c.id}`}>
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { setDeleteError(null); setDeleteTarget(c); }} title="Fall löschen" className="text-gray-500 hover:text-red-400 transition-colors" data-testid={`button-delete-case-${c.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DeleteConfirmModal
        open={!!deleteTarget}
        title="Fall löschen"
        description={deleteTarget ? (
          <>
            Diese Aktion kann nicht rückgängig gemacht werden. Der Fall{" "}
            <span className="text-white font-medium">{deleteTarget.caseNumber} – {deleteTarget.title}</span>{" "}
            wird dauerhaft gelöscht.
          </>
        ) : null}
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
    </div>
  );
}
