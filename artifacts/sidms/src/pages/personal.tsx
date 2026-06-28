import React, { useState, useMemo } from "react";
import {
  useGetOfficers,
  useUpdateOfficerPermissions,
  useCreateOfficer,
  getGetOfficersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Check, Pencil, X, Plus } from "lucide-react";

const CHECKBOX_COLS = [
  { key: "einweisung", label: "Einweisung" },
  { key: "waffenfreigabeLMG", label: "WF LMG" },
  { key: "waffenfreigabeHeavySniper", label: "WF H.Sniper" },
  { key: "freigabeCCU", label: "CCU" },
  { key: "freigabeZivil", label: "Zivil" },
  { key: "freigabeUndercover", label: "Undercover" },
  { key: "meldeamtSAHP", label: "SAHP" },
  { key: "meldeamtPD", label: "PD" },
  { key: "meldeamtLI", label: "LI" },
  { key: "idChange", label: "ID Change" },
] as const;

type CheckboxKey = (typeof CHECKBOX_COLS)[number]["key"];
type TextField = "dienstnummer" | "name" | "rank" | "deckname" | "telNr" | "beitritt";

type EditingCell = { officerId: number; field: TextField; value: string };

export default function Personal() {
  const { data: officers, isLoading } = useGetOfficers();
  const updatePermissions = useUpdateOfficerPermissions();
  const createOfficer = useCreateOfficer();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ dienstnummer: "", name: "", rank: "", passwort: "", deckname: "", telNr: "", beitritt: "" });
  const [newError, setNewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sortedOfficers = useMemo(() => {
    if (!officers) return [];
    return [...officers].sort((a, b) =>
      a.dienstnummer.localeCompare(b.dienstnummer, "de", { numeric: true, sensitivity: "base" })
    );
  }, [officers]);

  const patchOfficer = async (id: number, data: Record<string, unknown>) => {
    setSaving(id);
    try {
      await updatePermissions.mutateAsync({ id, data: data as Parameters<typeof updatePermissions.mutateAsync>[0]["data"] });
      queryClient.invalidateQueries({ queryKey: getGetOfficersQueryKey() });
    } finally {
      setSaving(null);
    }
  };

  const toggleBool = (officerId: number, field: CheckboxKey, current: boolean) => {
    patchOfficer(officerId, { [field]: !current });
  };

  const commitEdit = () => {
    if (!editing) return;
    const required = editing.field === "dienstnummer" || editing.field === "name" || editing.field === "rank";
    if (required && editing.value.trim() === "") { setEditing(null); return; }
    patchOfficer(editing.officerId, { [editing.field]: required ? editing.value.trim() : (editing.value || null) });
    setEditing(null);
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
          beitritt: newForm.beitritt || null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetOfficersQueryKey() });
      setShowNew(false);
      setNewForm({ dienstnummer: "", name: "", rank: "", passwort: "", deckname: "", telNr: "", beitritt: "" });
    } catch {
      setNewError("Konnte nicht angelegt werden. Ist die Dienstnummer evtl. schon vergeben?");
    } finally {
      setSubmitting(false);
    }
  };

  const renderEditableCell = (o: NonNullable<typeof officers>[number], field: TextField, className: string, placeholder = "—") => {
    const isEditing = editing?.officerId === o.id && editing.field === field;
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            className="bg-[#0a0f1a] border border-[#c9a227]/50 rounded px-1.5 py-0.5 text-white w-28 text-xs outline-none focus:border-[#c9a227]"
            value={editing.value}
            onChange={e => setEditing({ ...editing, value: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(null); }}
          />
          <button onClick={commitEdit} className="text-green-400 hover:text-green-300"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-300"><X className="w-3.5 h-3.5" /></button>
        </div>
      );
    }
    return (
      <div
        className="flex items-center gap-1 group cursor-pointer min-w-[5rem]"
        onClick={() => setEditing({ officerId: o.id, field, value: (o[field] ?? "") as string })}
      >
        <span className={className}>{(o[field] as string | null) || <span className="text-gray-600 italic">{placeholder}</span>}</span>
        <Pencil className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    );
  };

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
          <Plus className="w-3.5 h-3.5" /> Neues Personal
        </button>
      </div>

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
              <th className="text-left px-3 py-2.5 text-gray-400 font-medium">Beitritt</th>
              <th className="px-3 py-2.5 border-l border-[#1e2d4a]" colSpan={CHECKBOX_COLS.length}>
                <div className="grid text-center text-gray-400 font-medium" style={{ gridTemplateColumns: `repeat(${CHECKBOX_COLS.length}, 4.5rem)` }}>
                  {CHECKBOX_COLS.map(c => (
                    <span key={c.key} className="px-1 truncate" title={c.label}>{c.label}</span>
                  ))}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7 + CHECKBOX_COLS.length} className="text-center py-8 text-gray-500">Laden...</td></tr>
            ) : sortedOfficers.map(o => (
              <tr
                key={o.id}
                className="border-b border-[#1e2d4a]/40 hover:bg-[#1a2744]/30 transition-colors"
                data-testid={`officer-${o.id}`}
              >
                <td className="px-3 py-2 text-gray-500">{o.id}</td>
                <td className="px-3 py-2">{renderEditableCell(o, "dienstnummer", "text-[#c9a227] font-mono")}</td>
                <td className="px-3 py-2">{renderEditableCell(o, "name", "text-white font-medium")}</td>
                <td className="px-3 py-2">{renderEditableCell(o, "rank", "text-gray-400")}</td>
                <td className="px-3 py-2">{renderEditableCell(o, "deckname", "text-gray-300")}</td>
                <td className="px-3 py-2">{renderEditableCell(o, "telNr", "text-gray-300")}</td>
                <td className="px-3 py-2">{renderEditableCell(o, "beitritt", "text-gray-300")}</td>

                {CHECKBOX_COLS.map(({ key }) => (
                  <td key={key} className="px-3 py-2 border-l border-[#1e2d4a] first:border-l-0 text-center align-middle" style={{ width: "4.5rem" }}>
                    <button
                      onClick={() => toggleBool(o.id, key, o[key] as boolean)}
                      disabled={saving === o.id}
                      className={`w-4.5 h-4.5 rounded border transition-colors flex items-center justify-center mx-auto ${
                        o[key]
                          ? "bg-[#c9a227] border-[#c9a227] text-black"
                          : "bg-transparent border-gray-600 hover:border-[#c9a227]/50"
                      } ${saving === o.id ? "opacity-50" : ""}`}
                    >
                      {o[key] && <Check className="w-3 h-3" />}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-gray-600 space-y-0.5">
        <p><span className="text-gray-500 font-medium">WF LMG</span> = Waffenfreigabe LMG &nbsp;·&nbsp; <span className="text-gray-500 font-medium">WF H.Sniper</span> = Waffenfreigabe Heavy Sniper</p>
        <p>Alle Zellen durch Klick bearbeiten · Kästchen direkt anklicken zum Aktivieren/Deaktivieren · Sortiert nach Dienstnummer</p>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a]">
              <h2 className="text-sm font-semibold text-white">Neues Personal anlegen</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dienstnummer *" value={newForm.dienstnummer} onChange={v => setNewForm({ ...newForm, dienstnummer: v })} placeholder="D-1011" />
                <Field label="Rang *" value={newForm.rank} onChange={v => setNewForm({ ...newForm, rank: v })} placeholder="Special Agent" />
              </div>
              <Field label="Name *" value={newForm.name} onChange={v => setNewForm({ ...newForm, name: v })} placeholder="Max Mustermann" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Deckname" value={newForm.deckname} onChange={v => setNewForm({ ...newForm, deckname: v })} />
                <Field label="Tel.Nr." value={newForm.telNr} onChange={v => setNewForm({ ...newForm, telNr: v })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Beitritt" value={newForm.beitritt} onChange={v => setNewForm({ ...newForm, beitritt: v })} placeholder="28.06.2026" />
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
