import React, { useState, useMemo } from "react";
import {
  useGetOfficers,
  useUpdateOfficerPermissions,
  useCreateOfficer,
  useDeleteOfficer,
  getGetOfficersQueryKey,
  type Officer,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Check, Pencil, X, Plus, Trash2 } from "lucide-react";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";

const CHECKBOX_COLS = [
  { key: "einweisung", label: "Einweisung" },
  { key: "waffenfreigabeLMG", label: "WF LMG" },
  { key: "waffenfreigabeHeavySniper", label: "WF H.Sniper" },
  { key: "freigabeCCU", label: "CCU" },
  { key: "freigabeZivil", label: "Freigabe Zivil" },
  { key: "freigabeUndercover", label: "Freigabe Undercover" },
  { key: "meldeamtSAHP", label: "Meldeamt SAHP" },
  { key: "meldeamtPD", label: "Meldeamt LSPD" },
  { key: "meldeamtLI", label: "Meldeamt LI" },
  { key: "idChange", label: "ID Change" },
] as const;

type CheckboxKey = (typeof CHECKBOX_COLS)[number]["key"];

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
  id: string;
  dienstnummer: string;
  name: string;
  rank: string;
  deckname: string;
  telNr: string;
  abmeldungBis: string;
  beitritt: string;
} & Record<CheckboxKey, boolean>;

function toDateInputValue(stored: string | null | undefined): string {
  if (!stored) return "";
  const de = stored.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (de) return `${de[3]}-${de[2]}-${de[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  return "";
}

function formatBeitritt(stored: string | null | undefined): string {
  if (!stored) return "";
  const iso = stored.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return stored;
}

function draftFromOfficer(o: Officer): Draft {
  const d = {
    id: String(o.id),
    dienstnummer: o.dienstnummer,
    name: o.name,
    rank: o.rank,
    deckname: o.deckname ?? "",
    telNr: o.telNr ?? "",
    abmeldungBis: o.abmeldungBis ?? "",
    beitritt: toDateInputValue(o.beitritt),
  } as Draft;
  for (const { key } of CHECKBOX_COLS) d[key] = o[key] as boolean;
  return d;
}

const inputCls =
  "bg-[#0a0f1a] border border-[#c9a227]/40 rounded px-1.5 py-1 text-white text-xs outline-none focus:border-[#c9a227]";

export default function Personal() {
  const { data: officers, isLoading } = useGetOfficers();
  const updatePermissions = useUpdateOfficerPermissions();
  const createOfficer = useCreateOfficer();
  const deleteOfficer = useDeleteOfficer();
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editOriginal, setEditOriginal] = useState<Officer | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Officer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ dienstnummer: "", name: "", rank: RANKS[RANKS.length - 1].name, passwort: "", deckname: "", telNr: "", abmeldungBis: "", beitritt: "" });
  const [newError, setNewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetOfficersQueryKey() });

  const sortedOfficers = useMemo(() => {
    if (!officers) return [];
    return [...officers].sort((a, b) =>
      a.dienstnummer.localeCompare(b.dienstnummer, "de", { numeric: true, sensitivity: "base" })
    );
  }, [officers]);

  const startEdit = (o: Officer) => {
    setRowError(null);
    setEditingId(o.id);
    setEditOriginal(o);
    setDraft(draftFromOfficer(o));
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
    const idNum = parseInt(draft.id, 10);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      setRowError("ID muss eine positive Zahl sein.");
      return;
    }

    // Only send fields the user actually changed. This avoids unnecessary
    // writes and prevents clobbering legacy values (e.g. an unparsable
    // Beitritt date that maps to an empty date input).
    const payload: Record<string, unknown> = {};
    if (idNum !== editOriginal.id) payload.id = idNum;
    if (draft.dienstnummer.trim() !== editOriginal.dienstnummer) payload.dienstnummer = draft.dienstnummer.trim();
    if (draft.name.trim() !== editOriginal.name) payload.name = draft.name.trim();
    if (draft.rank.trim() !== editOriginal.rank) payload.rank = draft.rank.trim();
    if (draft.deckname.trim() !== (editOriginal.deckname ?? "")) payload.deckname = draft.deckname.trim() || null;
    if (draft.telNr.trim() !== (editOriginal.telNr ?? "")) payload.telNr = draft.telNr.trim() || null;
    if (draft.abmeldungBis.trim() !== (editOriginal.abmeldungBis ?? "")) payload.abmeldungBis = draft.abmeldungBis.trim() || null;
    if (draft.beitritt !== toDateInputValue(editOriginal.beitritt)) payload.beitritt = draft.beitritt || null;
    for (const { key } of CHECKBOX_COLS) {
      if (draft[key] !== (editOriginal[key] as boolean)) payload[key] = draft[key];
    }

    if (Object.keys(payload).length === 0) {
      cancelEdit();
      return;
    }

    setBusyId(editingId);
    try {
      await updatePermissions.mutateAsync({
        id: editingId,
        data: payload as Parameters<typeof updatePermissions.mutateAsync>[0]["data"],
      });
      invalidate();
      cancelEdit();
    } catch {
      setRowError("Speichern fehlgeschlagen — ist die ID oder Dienstnummer evtl. schon vergeben?");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setDeleteError(null);
    try {
      await deleteOfficer.mutateAsync({ id: deleteTarget.id });
      invalidate();
      setDeleteTarget(null);
    } catch {
      setDeleteError("Löschen fehlgeschlagen — bitte erneut versuchen.");
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
      await createOfficer.mutateAsync({
        data: {
          dienstnummer: newForm.dienstnummer.trim(),
          name: newForm.name.trim(),
          rank: newForm.rank.trim(),
          passwort: newForm.passwort || undefined,
          deckname: newForm.deckname || null,
          telNr: newForm.telNr || null,
          abmeldungBis: newForm.abmeldungBis || null,
          beitritt: newForm.beitritt || null,
        },
      });
      invalidate();
      setShowNew(false);
      setNewForm({ dienstnummer: "", name: "", rank: RANKS[RANKS.length - 1].name, passwort: "", deckname: "", telNr: "", abmeldungBis: "", beitritt: "" });
    } catch {
      setNewError("Konnte nicht angelegt werden. Ist die Dienstnummer evtl. schon vergeben?");
    } finally {
      setSubmitting(false);
    }
  };

  const setDraftField = (field: keyof Draft, value: string | boolean) =>
    setDraft(d => (d ? { ...d, [field]: value } : d));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-[#c9a227]" />
          <div>
            <h1 className="text-base font-semibold text-white">Personal</h1>
            <p className="text-xs text-gray-400">Übersicht und Freigaben aller Beamten der Special Investigation Division.</p>
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
        <table className="text-xs whitespace-nowrap">
          <thead>
            <tr className="bg-[#0a0f1a] border-b border-[#1e2d4a]">
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">ID</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Dienstnummer</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Name</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Rang</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Deckname</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Tel.Nr.</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Abmeldung bis</th>
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Beitritt</th>
              {CHECKBOX_COLS.map(c => (
                <th key={c.key} className="px-2 py-2.5 text-gray-400 font-medium text-center border-l border-[#1e2d4a] first:border-l-0 align-bottom" title={c.label}>
                  <span className="block w-20 mx-auto leading-tight whitespace-normal break-words">{c.label}</span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-gray-400 font-medium text-center border-l border-[#1e2d4a]">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9 + CHECKBOX_COLS.length} className="text-center py-8 text-gray-500">Laden...</td></tr>
            ) : sortedOfficers.map(o => {
              const isEditing = editingId === o.id && draft;
              const busy = busyId === o.id;
              const abgemeldet = !!(o.abmeldungBis && o.abmeldungBis.trim());
              const rowCls = isEditing
                ? "bg-[#1a2744]/40"
                : abgemeldet
                  ? "bg-amber-950/25 hover:bg-amber-950/40"
                  : "hover:bg-[#1a2744]/30";
              return (
                <tr
                  key={o.id}
                  className={`border-b border-[#1e2d4a]/40 transition-colors ${rowCls}`}
                  data-testid={`officer-${o.id}`}
                >
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input className={`${inputCls} w-14`} value={draft.id} onChange={e => setDraftField("id", e.target.value)} inputMode="numeric" />
                      : <span className="text-gray-500">{o.id}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input className={`${inputCls} w-24`} value={draft.dienstnummer} onChange={e => setDraftField("dienstnummer", e.target.value)} />
                      : <span className="text-[#c9a227] font-mono">{o.dienstnummer}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input className={`${inputCls} w-36`} value={draft.name} onChange={e => setDraftField("name", e.target.value)} />
                      : <span className="text-white font-medium">{o.name}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <select className={`${inputCls} w-44`} value={draft.rank} onChange={e => setDraftField("rank", e.target.value)}>
                        {!RANKS.some(r => r.name === draft.rank) && draft.rank !== "" && (
                          <option value={draft.rank}>{draft.rank}</option>
                        )}
                        {RANKS.map(r => (
                          <option key={r.level} value={r.name}>{r.level} | {r.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-400">{o.rank}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input className={`${inputCls} w-28`} value={draft.deckname} onChange={e => setDraftField("deckname", e.target.value)} />
                      : <span className="text-gray-300">{o.deckname || <span className="text-gray-600">—</span>}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input className={`${inputCls} w-24`} value={draft.telNr} onChange={e => setDraftField("telNr", e.target.value)} />
                      : <span className="text-gray-300">{o.telNr || <span className="text-gray-600">—</span>}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input className={`${inputCls} w-28`} value={draft.abmeldungBis} onChange={e => setDraftField("abmeldungBis", e.target.value)} />
                      : abgemeldet ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-300 border border-amber-500/40">Abgemeldet</span>
                          <span className="text-gray-300">{o.abmeldungBis}</span>
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? <input type="date" className={`${inputCls} w-36`} value={draft.beitritt} onChange={e => setDraftField("beitritt", e.target.value)} />
                      : <span className="text-gray-300">{formatBeitritt(o.beitritt) || <span className="text-gray-600">—</span>}</span>}
                  </td>

                  {CHECKBOX_COLS.map(({ key }) => (
                    <td key={key} className="px-2 py-2 border-l border-[#1e2d4a] first:border-l-0 text-center align-middle">
                      <button
                        onClick={() => isEditing && setDraftField(key, !draft[key])}
                        disabled={!isEditing}
                        className={`w-4 h-4 rounded border transition-colors flex items-center justify-center mx-auto ${
                          (isEditing ? draft[key] : (o[key] as boolean))
                            ? "bg-[#c9a227] border-[#c9a227] text-black"
                            : "bg-transparent border-gray-600"
                        } ${isEditing ? "cursor-pointer hover:border-[#c9a227]" : "cursor-default opacity-90"}`}
                      >
                        {(isEditing ? draft[key] : (o[key] as boolean)) && <Check className="w-3 h-3" />}
                      </button>
                    </td>
                  ))}

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
                        <button onClick={() => startEdit(o)} disabled={busy} className="p-1 rounded bg-[#1e3a8a]/40 text-blue-300 hover:bg-[#1e3a8a]/60 disabled:opacity-50" title="Bearbeiten">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setDeleteError(null); setDeleteTarget(o); }} disabled={busy} className="p-1 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 disabled:opacity-50" title="Löschen">
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
        <p><span className="text-gray-500 font-medium">WF LMG</span> = Waffenfreigabe LMG &nbsp;·&nbsp; <span className="text-gray-500 font-medium">WF H.Sniper</span> = Waffenfreigabe Heavy Sniper</p>
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
                <Field label="Deckname" value={newForm.deckname} onChange={v => setNewForm({ ...newForm, deckname: v })} />
                <Field label="Tel.Nr." value={newForm.telNr} onChange={v => setNewForm({ ...newForm, telNr: v })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Abmeldung bis" value={newForm.abmeldungBis} onChange={v => setNewForm({ ...newForm, abmeldungBis: v })} />
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Beitritt</label>
                  <input
                    type="date"
                    value={newForm.beitritt}
                    onChange={e => setNewForm({ ...newForm, beitritt: e.target.value })}
                    className="w-full bg-[#0a0f1a] border border-[#1e2d4a] rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#c9a227]/50"
                  />
                </div>
                <Field label="Passwort" value={newForm.passwort} onChange={v => setNewForm({ ...newForm, passwort: v })} placeholder="Standard: 1234" />
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
      <DeleteConfirmModal
        open={!!deleteTarget}
        title="Mitglied entfernen"
        description={deleteTarget ? (
          <>
            Diese Aktion kann nicht rückgängig gemacht werden.{" "}
            <span className="text-white font-medium">{deleteTarget.name} ({deleteTarget.dienstnummer})</span>{" "}
            wird dauerhaft aus dem Personal entfernt.
          </>
        ) : null}
        busy={busyId === deleteTarget?.id}
        error={deleteError}
        confirmLabel="Endgültig entfernen"
        busyLabel="Entfernen..."
        onConfirm={confirmDelete}
        onCancel={() => { if (busyId !== deleteTarget?.id) setDeleteTarget(null); }}
      />
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
