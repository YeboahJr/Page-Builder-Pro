import React, { useState } from "react";
import {
  useGetPatrols,
  useGetOfficers,
  useUpdatePatrol,
  getGetPatrolsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Users } from "lucide-react";

const PATROL_TYPES = ["Regelstreife", "Sonderstreife", "Undercover"];
const STATUS_META: Record<string, { text: string; dot: string }> = {
  "Code 1": { text: "text-green-400", dot: "bg-green-500" },
  "MD-Dienst": { text: "text-blue-400", dot: "bg-blue-500" },
  "Geiselnahme": { text: "text-red-400", dot: "bg-red-500" },
  "Event": { text: "text-purple-400", dot: "bg-purple-500" },
  "Zivil Streife": { text: "text-cyan-400", dot: "bg-cyan-500" },
  "Undercover Streife": { text: "text-indigo-400", dot: "bg-indigo-500" },
  "Standby": { text: "text-yellow-400", dot: "bg-yellow-500" },
  "Abwesend": { text: "text-gray-400", dot: "bg-gray-500" },
  "Nicht Stören!": { text: "text-rose-400", dot: "bg-rose-500" },
  "Ghetto-Streife": { text: "text-orange-400", dot: "bg-orange-500" },
  "Korruptionsfall": { text: "text-pink-400", dot: "bg-pink-500" },
  "Anwaltsgespräch": { text: "text-teal-400", dot: "bg-teal-500" },
  "Abteilungsarbeit": { text: "text-slate-400", dot: "bg-slate-500" },
  "Kongress": { text: "text-amber-400", dot: "bg-amber-500" },
};
const SLOT_STATUSES = Object.keys(STATUS_META);
const DEFAULT_STATUS = "Code 1";
const VEHICLES = ["Fahrzeug wählen", "Streifenwagen 1", "Streifenwagen 2", "SUV", "Motorrad", "Zivilfahrzeug"];

const ACCENTS = [
  "#e0922f", // amber
  "#3ba776", // green
  "#2fa6a0", // teal
  "#3d9b5a", // emerald
  "#d4b53a", // yellow
  "#3a78c9", // blue
  "#8a5cd1", // purple
  "#3a93c9", // sky
  "#c94545", // red
  "#5aa83a", // lime
];

interface PatrolSlot {
  position: string;
  officerId: number | null;
  officerName: string | null;
  notes: string | null;
  abwesend?: boolean;
  funkAus?: boolean;
}

interface PatrolDraft {
  patrolType: string;
  status: string;
  vehicle: string | null;
  slots: PatrolSlot[];
}

function patrolNum(name: string): number {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function statusDot(s: string) {
  const map: Record<string, string> = {
    "Anwesend": "bg-green-500",
    "In Einsatz": "bg-yellow-500",
    "Pause": "bg-blue-500",
    "Abwesend": "bg-red-500",
  };
  return map[s] ?? "bg-gray-500";
}

function radioStatusDot(s: string) {
  return s === "Aktiv" ? "bg-green-500" : "bg-gray-600";
}

function slotStatusColor(s: string) {
  return STATUS_META[s]?.text ?? "text-gray-400";
}

function patrolStatusDot(s: string | null) {
  return (s && STATUS_META[s]?.dot) || "bg-gray-600";
}

export default function Streifen() {
  const qc = useQueryClient();
  const { data: patrols, isLoading } = useGetPatrols();
  const { data: officers } = useGetOfficers();
  const updatePatrol = useUpdatePatrol();
  const [drafts, setDrafts] = useState<Record<number, PatrolDraft>>({});
  const [saving, setSaving] = useState(false);

  const deriveDraft = (patrolId: number): PatrolDraft => {
    const p = patrols?.find(x => x.id === patrolId);
    return {
      patrolType: p?.patrolType ?? "Regelstreife",
      status: p?.status ?? DEFAULT_STATUS,
      vehicle: p?.vehicle ?? null,
      slots: (p?.slots as PatrolSlot[]) ?? [],
    };
  };

  const getDraft = (patrolId: number): PatrolDraft => drafts[patrolId] ?? deriveDraft(patrolId);

  const patchDraft = (patrolId: number, partial: Partial<PatrolDraft>) => {
    setDrafts(prev => {
      const base = prev[patrolId] ?? deriveDraft(patrolId);
      return { ...prev, [patrolId]: { ...base, ...partial } };
    });
  };

  const updateSlot = (patrolId: number, slotIdx: number, partial: Partial<PatrolSlot>) => {
    setDrafts(prev => {
      const base = prev[patrolId] ?? deriveDraft(patrolId);
      const slots = base.slots.map((s, i) => (i === slotIdx ? { ...s, ...partial } : s));
      return { ...prev, [patrolId]: { ...base, slots } };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [id, draft] of Object.entries(drafts)) {
        await updatePatrol.mutateAsync({
          id: parseInt(id),
          data: {
            patrolType: draft.patrolType,
            status: draft.status,
            vehicle: draft.vehicle,
            slots: draft.slots,
          },
        });
      }
      qc.invalidateQueries({ queryKey: getGetPatrolsQueryKey() });
      setDrafts({});
    } finally {
      setSaving(false);
    }
  };

  const sortedPatrols = [...(patrols ?? [])].sort((a, b) => patrolNum(a.name) - patrolNum(b.name));

  // Derive each officer's duty status from their patrol assignment (live, incl. drafts).
  const assignedMap = new Map<
    number,
    { abwesend: boolean; funkAus: boolean; patrolStatus: string | null }
  >();
  for (const p of sortedPatrols) {
    const d = getDraft(p.id);
    for (const s of d.slots) {
      if (s.officerId != null) {
        const prev = assignedMap.get(s.officerId);
        assignedMap.set(s.officerId, {
          abwesend: (prev?.abwesend ?? false) || !!s.abwesend,
          funkAus: (prev?.funkAus ?? false) || !!s.funkAus,
          patrolStatus: prev?.patrolStatus ?? d.status ?? null,
        });
      }
    }
  }

  const onDutyOfficers = officers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Streifenverwaltung</h1>
          <p className="text-xs text-gray-400">Verwaltung und Übersicht aller aktiven Streifen.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || Object.keys(drafts).length === 0}
          className="flex items-center gap-2 bg-[#c9a227] hover:bg-[#d4af3a] text-black text-sm font-bold px-4 py-2 rounded transition-colors disabled:opacity-50"
          data-testid="button-save-patrols"
        >
          <Save className="w-4 h-4" />
          {saving ? "Speichern..." : "Änderungen speichern"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Patrols grid */}
        <div className="col-span-2">
          {isLoading ? (
            <p className="text-gray-500 text-sm">Laden...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {sortedPatrols.map((patrol, pIdx) => {
                const draft = getDraft(patrol.id);
                const accent = ACCENTS[pIdx % ACCENTS.length];
                return (
                  <div
                    key={patrol.id}
                    className="bg-[#0d1526] border border-[#1e2d4a] rounded overflow-hidden"
                    style={{ borderTop: `2px solid ${accent}` }}
                    data-testid={`patrol-${patrol.id}`}
                  >
                    <div className="px-3 py-2 border-b border-[#1e2d4a] bg-[#0a0f1a]">
                      <p className="text-xs font-semibold" style={{ color: accent }}>
                        {patrol.name}
                      </p>
                    </div>

                    {/* Patrol-level controls (once per Streife) */}
                    <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-[#1e2d4a]/60 bg-[#0b1220]">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Streifenart</span>
                        <select
                          value={draft.patrolType}
                          onChange={e => patchDraft(patrol.id, { patrolType: e.target.value })}
                          className="bg-[#0a0f1a] border border-[#253650] text-gray-300 text-xs px-1.5 py-1 rounded focus:outline-none"
                          data-testid={`select-patroltype-${patrol.id}`}
                        >
                          {PATROL_TYPES.map(t => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Status</span>
                        <select
                          value={draft.status}
                          onChange={e => patchDraft(patrol.id, { status: e.target.value })}
                          className={`bg-[#0a0f1a] border border-[#253650] text-xs px-1.5 py-1 rounded focus:outline-none ${slotStatusColor(draft.status)}`}
                          data-testid={`select-status-${patrol.id}`}
                        >
                          {SLOT_STATUSES.map(s => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Fahrzeug</span>
                        <select
                          value={draft.vehicle ?? ""}
                          onChange={e => patchDraft(patrol.id, { vehicle: e.target.value || null })}
                          className="bg-[#0a0f1a] border border-[#253650] text-gray-300 text-xs px-1.5 py-1 rounded focus:outline-none"
                          data-testid={`select-vehicle-${patrol.id}`}
                        >
                          {VEHICLES.map(v => (
                            <option key={v} value={v === "Fahrzeug wählen" ? "" : v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#1e2d4a]/50">
                            {["Position", "Dienstnummer / Agent", "Notizen"].map(h => (
                              <th
                                key={h}
                                className="text-left px-2 py-1.5 text-gray-500 font-medium whitespace-nowrap"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {draft.slots.map((slot, idx) => (
                            <tr key={idx} className="border-b border-[#1e2d4a]/30 align-top">
                              <td className="px-2 py-1.5 text-gray-400 font-mono">{slot.position}</td>
                              <td className="px-2 py-1">
                                <div className="flex flex-col gap-1">
                                  <select
                                    value={slot.officerName ?? ""}
                                    onChange={e => {
                                      const name = e.target.value;
                                      const officer = officers?.find(o => o.name != null && o.name === name);
                                      updateSlot(patrol.id, idx, {
                                        officerName: name || null,
                                        officerId: officer?.id ?? null,
                                        abwesend: false,
                                        funkAus: false,
                                      });
                                    }}
                                    className="bg-[#0a0f1a] border border-[#253650] text-gray-300 text-xs px-1 py-0.5 rounded focus:outline-none w-full min-w-[150px]"
                                    data-testid={`select-officer-${patrol.id}-${idx}`}
                                  >
                                    <option value="">Dienstnummer wählen</option>
                                    {officers?.map(o => (
                                      <option key={o.id} value={o.name}>
                                        {o.dienstnummer} – {o.name}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="flex items-center gap-3">
                                    <label
                                      className={`flex items-center gap-1 text-[10px] ${slot.officerId ? "text-gray-300" : "text-gray-600"}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={!!slot.abwesend}
                                        disabled={!slot.officerId}
                                        onChange={e => updateSlot(patrol.id, idx, { abwesend: e.target.checked })}
                                        className="accent-[#c9a227] w-3 h-3"
                                        data-testid={`check-abwesend-${patrol.id}-${idx}`}
                                      />
                                      Abwesend
                                    </label>
                                    <label
                                      className={`flex items-center gap-1 text-[10px] ${slot.officerId ? "text-gray-300" : "text-gray-600"}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={!!slot.funkAus}
                                        disabled={!slot.officerId}
                                        onChange={e => updateSlot(patrol.id, idx, { funkAus: e.target.checked })}
                                        className="accent-[#c9a227] w-3 h-3"
                                        data-testid={`check-funkaus-${patrol.id}-${idx}`}
                                      />
                                      Funk aus
                                    </label>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="text"
                                  value={slot.notes ?? ""}
                                  onChange={e => updateSlot(patrol.id, idx, { notes: e.target.value || null })}
                                  placeholder="—"
                                  className="bg-[#0a0f1a] border border-[#253650] text-gray-300 text-xs px-1.5 py-0.5 rounded focus:outline-none w-full min-w-[80px]"
                                  data-testid={`input-notes-${patrol.id}-${idx}`}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Officer on duty panel */}
        <div className="space-y-3">
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded">
            <div className="px-4 py-3 border-b border-[#1e2d4a] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#c9a227]" />
              <div>
                <h2 className="text-xs font-semibold text-white">Officer im Dienst</h2>
                <p className="text-xs text-gray-500">Übersicht aller aktuell angemeldeten Officer.</p>
              </div>
            </div>
            <div className="divide-y divide-[#1e2d4a]/40 max-h-[500px] overflow-y-auto">
              {onDutyOfficers.map(o => {
                const a = assignedMap.get(o.id);
                const status = a ? (a.abwesend ? "Abwesend" : "Anwesend") : "Abwesend";
                const funk = a ? (a.funkAus ? "Aus" : "Aktiv") : "Aus";
                const patrolStatus = a?.patrolStatus ?? null;
                return (
                  <div
                    key={o.id}
                    className="px-4 py-2.5 flex items-center gap-3 hover:bg-[#1a2744]/30 transition-colors"
                    data-testid={`officer-row-${o.id}`}
                  >
                    <div className="w-7 h-7 rounded-full bg-[#1a2744] border border-[#253650] flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-gray-400 font-medium">
                        {o.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{o.name}</p>
                      <p className="text-xs text-gray-500">
                        {o.dienstnummer} · {o.rank}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-gray-400">{status}</p>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${statusDot(status)}`} title={`Status: ${status}`} />
                      <div
                        className={`w-2 h-2 rounded-full ${patrolStatusDot(patrolStatus)}`}
                        title={`Streife: ${patrolStatus ?? "—"}`}
                      />
                      <div className={`w-2 h-2 rounded-full ${radioStatusDot(funk)}`} title={`Funk ${funk}`} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="px-4 py-3 border-t border-[#1e2d4a] space-y-1.5">
              {[
                { color: "bg-green-500", label: "1 · Status", desc: "Grün = in Streife eingetragen, Rot = abwesend" },
                { color: "bg-blue-500", label: "2 · Streife", desc: "Status der zugewiesenen Streife" },
                { color: "bg-green-500", label: "3 · Funk", desc: "Grün = Funk aktiv, Grau = Funk aus" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${l.color} flex-shrink-0`} />
                  <span className="text-gray-400">{l.label} –</span>
                  <span className="text-gray-500">{l.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
