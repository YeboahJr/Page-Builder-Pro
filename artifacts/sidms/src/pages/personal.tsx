import React, { useState } from "react";
import { useGetOfficers, useUpdateOfficerPermissions } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetOfficersQueryKey } from "@workspace/api-client-react";
import { Users, Check, Pencil, X } from "lucide-react";

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

type EditingCell = { officerId: number; field: "deckname" | "telNr" | "beitritt"; value: string };

export default function Personal() {
  const { data: officers, isLoading } = useGetOfficers();
  const updatePermissions = useUpdateOfficerPermissions();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);

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
    patchOfficer(editing.officerId, { [editing.field]: editing.value || null });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-[#c9a227]" />
        <div>
          <h1 className="text-base font-semibold text-white">Personal</h1>
          <p className="text-xs text-gray-400">Übersicht und Freigaben aller Beamten der Special Investigation Division.</p>
        </div>
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
            ) : officers?.map(o => (
              <tr
                key={o.id}
                className="border-b border-[#1e2d4a]/40 hover:bg-[#1a2744]/30 transition-colors"
                data-testid={`officer-${o.id}`}
              >
                <td className="px-3 py-2 text-gray-500">{o.id}</td>
                <td className="px-3 py-2 text-[#c9a227] font-mono">{o.dienstnummer}</td>
                <td className="px-3 py-2 text-white font-medium">{o.name}</td>
                <td className="px-3 py-2 text-gray-400">{o.rank}</td>

                {(["deckname", "telNr", "beitritt"] as const).map(field => (
                  <td key={field} className="px-3 py-2">
                    {editing?.officerId === o.id && editing.field === field ? (
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
                    ) : (
                      <div
                        className="flex items-center gap-1 group cursor-pointer min-w-[5rem]"
                        onClick={() => setEditing({ officerId: o.id, field, value: (o[field] ?? "") as string })}
                      >
                        <span className="text-gray-300">{(o[field] as string | null) ?? <span className="text-gray-600 italic">—</span>}</span>
                        <Pencil className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    )}
                  </td>
                ))}

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
        <p>Textzellen (Deckname, Tel.Nr., Beitritt) durch Klick bearbeiten · Kästchen direkt anklicken zum Aktivieren/Deaktivieren</p>
      </div>
    </div>
  );
}
