import React, { useState } from "react";
import {
  useGetPatrols,
  useGetOfficers,
  useUpdatePatrol,
  getGetPatrolsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Edit3, Users } from "lucide-react";

const PATROL_TYPES = ["Regelstreife", "Sonderstreife", "Undercover"];
const SLOT_STATUSES = ["Frei auf Streife", "10-80", "10-66", "Nicht verfügbar"];
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
}

interface PatrolDraft {
  patrolType: string;
  status: string;
  vehicle: string | null;
  slots: PatrolSlot[];
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
  const map: Record<string, string> = {
    "Frei auf Streife": "text-green-400",
    "10-80": "text-yellow-400",
    "10-66": "text-blue-400",
    "Nicht verfügbar": "text-red-400",
  };
  return map[s] ?? "text-gray-400";
}

export default function Streifen() {
  const qc = useQueryClient();
  const { data: patrols, isLoading } = useGetPatrols();
  const { data: officers } = useGetOfficers();
  const updatePatrol = useUpdatePatrol();
  const [drafts, setDrafts] = useState<Record<number, PatrolDraft>>({});
  const [saving, setSaving] = useState(false);

  const getDraft = (patrol: {
    id: number;
    patrolType: string;
    status: string;
    vehicle?: string | null;
    slots: unknown;
  }): PatrolDraft => {
    if (drafts[patrol.id]) return drafts[patrol.id];
    return {
      patrolType: patrol.patrolType,
      status: patrol.status,
      vehicle: patrol.vehicle ?? null,
      slots: (patrol.slots as PatrolSlot[]) ?? [],
    };
  };

  const patchDraft = (patrolId: number, partial: Partial<PatrolDraft>) => {
    setDrafts(prev => {
      const base =
        prev[patrolId] ??
        (() => {
          const p = patrols?.find(x => x.id === patrolId);
          return {
            patrolType: p?.patrolType ?? "Regelstreife",
            status: p?.status ?? "Frei auf Streife",
            vehicle: p?.vehicle ?? null,
            slots: (p?.slots as PatrolSlot[]) ?? [],
          };
        })();
      return { ...prev, [patrolId]: { ...base, ...partial } };
    });
  };

  const updateSlot = (
    patrolId: number,
    slotIdx: number,
    field: keyof PatrolSlot,
    value: string | number | null,
  ) => {
    const base =
      drafts[patrolId] ??
      (() => {
        const p = patrols?.find(x => x.id === patrolId);
        return {
          patrolType: p?.patrolType ?? "Regelstreife",
          status: p?.status ?? "Frei auf Streife",
          vehicle: p?.vehicle ?? null,
          slots: (p?.slots as PatrolSlot[]) ?? [],
        };
      })();
    const slots = base.slots.map((s, i) => (i === slotIdx ? { ...s, [field]: value } : s));
    patchDraft(patrolId, { slots });
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
              {patrols?.map((patrol, pIdx) => {
                const draft = getDraft(patrol);
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
                            <tr key={idx} className="border-b border-[#1e2d4a]/30">
                              <td className="px-2 py-1.5 text-gray-400 font-mono">{slot.position}</td>
                              <td className="px-2 py-1">
                                <select
                                  value={slot.officerName ?? ""}
                                  onChange={e => {
                                    const name = e.target.value;
                                    const officer = officers?.find(o => o.name != null && o.name === name);
                                    updateSlot(patrol.id, idx, "officerName", name || null);
                                    updateSlot(patrol.id, idx, "officerId", officer?.id ?? null);
                                  }}
                                  className="bg-[#0a0f1a] border border-[#253650] text-gray-300 text-xs px-1 py-0.5 rounded focus:outline-none w-full min-w-[140px]"
                                >
                                  <option value="">Dienstnummer wählen</option>
                                  {officers?.map(o => (
                                    <option key={o.id} value={o.name}>
                                      {o.dienstnummer} – {o.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1">
                                <button className="text-gray-500 hover:text-gray-300 transition-colors">
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
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
              {onDutyOfficers.map(o => (
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
                      <p className="text-xs text-gray-400">{o.status}</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${statusDot(o.status)}`} title={o.status} />
                    <div
                      className={`w-2 h-2 rounded-full ${radioStatusDot(o.radioStatus ?? "")}`}
                      title={o.radioStatus ?? ""}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="px-4 py-3 border-t border-[#1e2d4a] space-y-1.5">
              {[
                { color: "bg-green-500", label: "Anwesend", desc: "Officer ist verfügbar" },
                { color: "bg-yellow-500", label: "In Einsatz", desc: "Officer ist in einem Einsatz" },
                { color: "bg-blue-500", label: "Pause", desc: "Officer ist in Pause" },
                { color: "bg-red-500", label: "Abwesend", desc: "Officer ist nicht verfügbar" },
                { color: "bg-gray-600", label: "Ausgeschaltet", desc: "Funk ist ausgeschaltet" },
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
