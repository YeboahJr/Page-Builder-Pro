import React, { useState, useMemo } from "react";
import {
  useGetIdChanges,
  useCreateIdChange,
  useUpdateIdChange,
  useDeleteIdChange,
  getGetIdChangesQueryKey,
  type IdChange,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, Check, Pencil, X, Plus, Trash2 } from "lucide-react";

const RANKS: { level: number; name: string }[] = [
  { level: 30, name: "Director of FIB" },
  { level: 29, name: "Vize Director of FIB" },
  { level: 28, name: "Assistant Director of FIB" },
  { level: 27, name: "Secretary of FIB" },
  { level: 26, name: "Human Resources Director" },
  { level: 25, name: "Management Chief" },
  { level: 24, name: "Division Chief" },
  { level: 23, name: "Deputy Division Chief" },
  { level: 22, name: "Unit Commander" },
  { level: 21, name: "Management Division Chief" },
  { level: 20, name: "Academy Agent" },
  { level: 19, name: "Commander" },
  { level: 18, name: "Supervising Head Agent" },
  { level: 17, name: "Supervising Agent" },
  { level: 16, name: "007 Agent [Media]" },
  { level: 15, name: "Head Agent" },
  { level: 14, name: "Elite Agent" },
  { level: 13, name: "Senior Special Agent" },
  { level: 12, name: "Special Agent" },
  { level: 11, name: "Junior Special Agent" },
  { level: 10, name: "Senior Field Agent" },
  { level: 9, name: "Field Agent" },
  { level: 8, name: "Junior Field Agent" },
  { level: 7, name: "Senior Agent" },
  { level: 6, name: "Agent" },
  { level: 5, name: "Junior Agent" },
  { level: 4, name: "Agent in Education" },
  { level: 3, name: "Facility Manager" },
  { level: 2, name: "Bewerber" },
  { level: 1, name: "Suspended" },
];

type Draft = {
  dienstnummer: string;
  name: string;
  rank: string;
  eigeneId: string;
  neueId: string;
  datum: string;
  uhrzeitAnfang: string;
  uhrzeitEnde: string;
};

function toDateInputValue(stored: string | null | undefined): string {
  if (!stored) return "";
  const de = stored.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (de) return `${de[3]}-${de[2]}-${de[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  return "";
}

function formatDatum(stored: string | null | undefined): string {
  if (!stored) return "";
  const iso = stored.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return stored;
}

function draftFromRow(r: IdChange): Draft {
  return {
    dienstnummer: r.dienstnummer,
    name: r.name,
    rank: r.rank,
    eigeneId: r.eigeneId ?? "",
    neueId: r.neueId ?? "",
    datum: toDateInputValue(r.datum),
    uhrzeitAnfang: r.uhrzeitAnfang ?? "",
    uhrzeitEnde: r.uhrzeitEnde ?? "",
  };
}

const emptyForm: Draft = {
  dienstnummer: "",
  name: "",
  rank: RANKS[RANKS.length - 1].name,
  eigeneId: "",
  neueId: "",
  datum: "",
  uhrzeitAnfang: "",
  uhrzeitEnde: "",
};

const inputCls =
  "bg-[#0a0f1a] border border-[#c9a227]/40 rounded px-1.5 py-1 text-white text-xs outline-none focus:border-[#c9a227]";

export default function IdChangePage() {
  const { data: rows, isLoading } = useGetIdChanges();
  const createRow = useCreateIdChange();
  const updateRow = useUpdateIdChange();
  const deleteRow = useDeleteIdChange();
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editOriginal, setEditOriginal] = useState<IdChange | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<Draft>(emptyForm);
  const [newError, setNewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetIdChangesQueryKey() });

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) =>
      a.dienstnummer.localeCompare(b.dienstnummer, "de", { numeric: true, sensitivity: "base" })
    );
  }, [rows]);

  const startEdit = (r: IdChange) => {
    setRowError(null);
    setEditingId(r.id);
    setEditOriginal(r);
    setDraft(draftFromRow(r));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setEditOriginal(null);
    setRowError(null);
  };

  const saveDraft = async () => {
    if (!draft || editingId === null || !editOriginal) return;
    if (!draft.dienstnummer.trim() || !draft.name.trim() || !draft.rank.trim()) {
      setRowError("Dienstnummer, Name und Rang dürfen nicht leer sein.");
      return;
    }

    const payload: Record<string, unknown> = {};
    if (draft.dienstnummer.trim() !== editOriginal.dienstnummer) payload.dienstnummer = draft.dienstnummer.trim();
    if (draft.name.trim() !== editOriginal.name) payload.name = draft.name.trim();
    if (draft.rank.trim() !== editOriginal.rank) payload.rank = draft.rank.trim();
    if (draft.eigeneId.trim() !== (editOriginal.eigeneId ?? "")) payload.eigeneId = draft.eigeneId.trim() || null;
    if (draft.neueId.trim() !== (editOriginal.neueId ?? "")) payload.neueId = draft.neueId.trim() || null;
    if (draft.datum !== toDateInputValue(editOriginal.datum)) payload.datum = draft.datum || null;
    if (draft.uhrzeitAnfang.trim() !== (editOriginal.uhrzeitAnfang ?? "")) payload.uhrzeitAnfang = draft.uhrzeitAnfang.trim() || null;
    if (draft.uhrzeitEnde.trim() !== (editOriginal.uhrzeitEnde ?? "")) payload.uhrzeitEnde = draft.uhrzeitEnde.trim() || null;

    if (Object.keys(payload).length === 0) {
      cancelEdit();
      return;
    }

    setBusyId(editingId);
    try {
      await updateRow.mutateAsync({
        id: editingId,
        data: payload as Parameters<typeof updateRow.mutateAsync>[0]["data"],
      });
      invalidate();
      cancelEdit();
    } catch {
      setRowError("Speichern fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (r: IdChange) => {
    if (!window.confirm(`Eintrag von ${r.name} (${r.dienstnummer}) wirklich löschen?`)) return;
    setBusyId(r.id);
    try {
      await deleteRow.mutateAsync({ id: r.id });
      invalidate();
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewError(null);
    if (!newForm.dienstnummer.trim() || !newForm.name.trim() || !newForm.rank.trim()) {
      setNewError("Dienstnummer, Name und Rang sind erforderlich.");
      return;
    }
    setSubmitting(true);
    try {
      await createRow.mutateAsync({
        data: {
          dienstnummer: newForm.dienstnummer.trim(),
          name: newForm.name.trim(),
          rank: newForm.rank.trim(),
          eigeneId: newForm.eigeneId.trim() || null,
          neueId: newForm.neueId.trim() || null,
          datum: newForm.datum || null,
          uhrzeitAnfang: newForm.uhrzeitAnfang.trim() || null,
          uhrzeitEnde: newForm.uhrzeitEnde.trim() || null,
        },
      });
      invalidate();
      setShowNew(false);
      setNewForm(emptyForm);
    } catch {
      setNewError("Konnte nicht angelegt werden.");
    } finally {
      setSubmitting(false);
    }
  };

  const setDraftField = (field: keyof Draft, value: string) =>
    setDraft(d => (d ? { ...d, [field]: value } : d));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-[#c9a227]" />
          <div>
            <h1 className="text-base font-semibold text-white">ID Change</h1>
            <p className="text-xs text-gray-400">Übersicht aller ID-Änderungen der Special Investigation Division.</p>
          </div>
        </div>
        <button
          onClick={() => { setShowNew(true); setNewError(null); }}
          className="flex items-center gap-1.5 bg-[#1e3a8a] hover:bg-[#1e40af] text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Neuer Eintrag
        </button>
      </div>

      {rowError && (
        <div className="bg-red-950/40 border border-red-800/50 text-red-300 text-xs rounded px-3 py-2">{rowError}</div>
      )}

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded overflow-x-auto">
        <table className="text-xs whitespace-nowrap w-full">
          <thead>
            <tr className="bg-[#0a0f1a] border-b border-[#1e2d4a]">
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Dienstnummer</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Name</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Rang</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Eigene ID</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Neue ID</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Datum</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Uhrzeit Anfang</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Uhrzeit Ende</th>
              <th className="px-3 py-2.5 text-gray-400 font-medium text-center border-l border-[#1e2d4a]">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-500">Laden...</td></tr>
            ) : sortedRows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-500">Keine Einträge vorhanden.</td></tr>
            ) : sortedRows.map(r => {
              const isEditing = editingId === r.id && draft;
              const busy = busyId === r.id;
              return (
                <tr
                  key={r.id}
                  className={`border-b border-[#1e2d4a]/40 transition-colors ${isEditing ? "bg-[#1a2744]/40" : "hover:bg-[#1a2744]/30"}`}
                  data-testid={`idchange-${r.id}`}
                >
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input className={`${inputCls} w-24`} value={draft.dienstnummer} onChange={e => setDraftField("dienstnummer", e.target.value)} />
                      : <span className="text-[#c9a227] font-mono">{r.dienstnummer}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input className={`${inputCls} w-36`} value={draft.name} onChange={e => setDraftField("name", e.target.value)} />
                      : <span className="text-white font-medium">{r.name}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <select className={`${inputCls} w-44`} value={draft.rank} onChange={e => setDraftField("rank", e.target.value)}>
                        {!RANKS.some(rk => rk.name === draft.rank) && draft.rank !== "" && (
                          <option value={draft.rank}>{draft.rank}</option>
                        )}
                        {RANKS.map(rk => (
                          <option key={rk.level} value={rk.name}>{rk.level} | {rk.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-400">{r.rank}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input className={`${inputCls} w-20`} value={draft.eigeneId} onChange={e => setDraftField("eigeneId", e.target.value)} />
                      : <span className="text-gray-300">{r.eigeneId || <span className="text-gray-600">—</span>}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input className={`${inputCls} w-20`} value={draft.neueId} onChange={e => setDraftField("neueId", e.target.value)} />
                      : <span className="text-gray-300">{r.neueId || <span className="text-gray-600">—</span>}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input type="date" className={`${inputCls} w-36`} value={draft.datum} onChange={e => setDraftField("datum", e.target.value)} />
                      : <span className="text-gray-300">{formatDatum(r.datum) || <span className="text-gray-600">—</span>}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input type="time" className={`${inputCls} w-28`} value={draft.uhrzeitAnfang} onChange={e => setDraftField("uhrzeitAnfang", e.target.value)} />
                      : <span className="text-gray-300">{r.uhrzeitAnfang || <span className="text-gray-600">—</span>}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input type="time" className={`${inputCls} w-28`} value={draft.uhrzeitEnde} onChange={e => setDraftField("uhrzeitEnde", e.target.value)} />
                      : <span className="text-gray-300">{r.uhrzeitEnde || <span className="text-gray-600">—</span>}</span>}
                  </td>
                  <td className="px-3 py-2 border-l border-[#1e2d4a] text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={saveDraft} disabled={busy} className="p-1 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50" title="Speichern">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={cancelEdit} disabled={busy} className="p-1 rounded bg-gray-600/20 text-gray-400 hover:bg-gray-600/30 disabled:opacity-50" title="Abbrechen">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => startEdit(r)} disabled={busy} className="p-1 rounded bg-[#1e3a8a]/40 text-blue-300 hover:bg-[#1e3a8a]/60 disabled:opacity-50" title="Bearbeiten">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(r)} disabled={busy} className="p-1 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 disabled:opacity-50" title="Löschen">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-gray-600 space-y-0.5">
        <p>Zeile über den Bearbeiten-Button (Stift) bearbeiten · Sortiert nach Dienstnummer</p>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a]">
              <h2 className="text-sm font-semibold text-white">Neuer Eintrag</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dienstnummer *" value={newForm.dienstnummer} onChange={v => setNewForm({ ...newForm, dienstnummer: v })} placeholder="D-1011" />
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Rang *</label>
                  <select
                    value={newForm.rank}
                    onChange={e => setNewForm({ ...newForm, rank: e.target.value })}
                    className="w-full bg-[#0a0f1a] border border-[#1e2d4a] rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#c9a227]/50"
                  >
                    {RANKS.map(r => <option key={r.level} value={r.name}>{r.level} | {r.name}</option>)}
                  </select>
                </div>
              </div>
              <Field label="Name *" value={newForm.name} onChange={v => setNewForm({ ...newForm, name: v })} placeholder="Max Mustermann" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Eigene ID" value={newForm.eigeneId} onChange={v => setNewForm({ ...newForm, eigeneId: v })} />
                <Field label="Neue ID" value={newForm.neueId} onChange={v => setNewForm({ ...newForm, neueId: v })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Datum</label>
                  <input
                    type="date"
                    value={newForm.datum}
                    onChange={e => setNewForm({ ...newForm, datum: e.target.value })}
                    className="w-full bg-[#0a0f1a] border border-[#1e2d4a] rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#c9a227]/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Uhrzeit Anfang</label>
                  <input
                    type="time"
                    value={newForm.uhrzeitAnfang}
                    onChange={e => setNewForm({ ...newForm, uhrzeitAnfang: e.target.value })}
                    className="w-full bg-[#0a0f1a] border border-[#1e2d4a] rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#c9a227]/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Uhrzeit Ende</label>
                  <input
                    type="time"
                    value={newForm.uhrzeitEnde}
                    onChange={e => setNewForm({ ...newForm, uhrzeitEnde: e.target.value })}
                    className="w-full bg-[#0a0f1a] border border-[#1e2d4a] rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#c9a227]/50"
                  />
                </div>
              </div>
              {newError && <p className="text-xs text-red-400">{newError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white transition-colors">Abbrechen</button>
                <button type="submit" disabled={submitting} className="bg-[#1e3a8a] hover:bg-[#1e40af] disabled:opacity-50 text-white px-4 py-1.5 rounded text-xs font-medium transition-colors">
                  {submitting ? "Anlegen..." : "Anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0a0f1a] border border-[#1e2d4a] rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#c9a227]/50"
      />
    </div>
  );
}
