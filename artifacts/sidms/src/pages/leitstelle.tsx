import React, { useState } from "react";
import {
  useGetPatrols,
  useGetOfficers,
  useUpdatePatrol,
  getGetPatrolsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Edit3, Circle, Users } from "lucide-react";

const PATROL_TYPES = ["Regelstreife", "Sonderstreife", "Undercover"];
const SLOT_STATUSES = ["Frei auf Streife", "10-80", "10-66", "Nicht verfügbar"];
const VEHICLES = ["Fahrzeug wählen", "Streifenwagen 1", "Streifenwagen 2", "SUV", "Motorrad", "Zivilfahrzeug"];

interface PatrolSlot {
  position: string;
  officerId: number | null;
  officerName: string | null;
  patrolType: string;
  status: string;
  vehicle: string | null;
  notes: string | null;
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
  const [localSlots, setLocalSlots] = useState<Record<number, PatrolSlot[]>>({});
  const [saving, setSaving] = useState(false);

  const getSlots = (patrol: { id: number; slots: unknown }): PatrolSlot[] => {
    if (localSlots[patrol.id]) return localSlots[patrol.id];
    return (patrol.slots as PatrolSlot[]) ?? [];
  };

  const updateSlot = (patrolId: number, slotIdx: number, field: keyof PatrolSlot, value: string | number | null) => {
    setLocalSlots(prev => {
      const current = prev[patrolId] ?? (patrols?.find(p => p.id === patrolId)?.slots as PatrolSlot[]) ?? [];
      const updated = current.map((s, i) => i === slotIdx ? { ...s, [field]: value } : s);
      return { ...prev, [patrolId]: updated };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [id, slots] of Object.entries(localSlots)) {
        await updatePatrol.mutateAsync({ id: parseInt(id), data: { slots } });
      }
      qc.invalidateQueries({ queryKey: getGetPatrolsQueryKey() });
      setLocalSlots({});
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
          disabled={saving || Object.keys(localSlots).length === 0}
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
              {patrols?.map(patrol => {
                const slots = getSlots(patrol);
                return (
                  <div key={patrol.id} className="bg-[#0d1526] border border-[#1e2d4a] rounded" data-testid={`patrol-${patrol.id}`}>
                    <div className="px-3 py-2 border-b border-[#1e2d4a] bg-[#0a0f1a]">
                      <p className="text-xs font-semibold text-white">{patrol.name}</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#1e2d4a]/50">
                            {["Position", "Dienstnummer / Agent", "Streifenart", "Status", "Fahrzeug", "Notizen"].map(h => (
                              <th key={h} className="text-left px-2 py-1.5 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {slots.map((slot, idx) => (
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
                                  className="bg-[#0a0f1a] border border-[#253650] text-gray-300 text-xs px-1 py-0.5 rounded focus:outline-none w-full min-w-[100px]"
                                >
                                  <option value="">Dienstnummer wählen</option>
                                  {officers?.map(o => (
                                    <option key={o.id} value={o.name}>{o.dienstnummer} – {o.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1">
                                <select
                                  value={slot.patrolType}
                                  onChange={e => updateSlot(patrol.id, idx, "patrolType", e.target.value)}
                                  className="bg-[#0a0f1a] border border-[#253650] text-gray-300 text-xs px-1 py-0.5 rounded focus:outline-none"
                                >
                                  {PATROL_TYPES.map(t => <option key={t}>{t}</option>)}
                                </select>
                              </td>
                              <td className="px-2 py-1">
                                <select
                                  value={slot.status}
                                  onChange={e => updateSlot(patrol.id, idx, "status", e.target.value)}
                                  className={`bg-[#0a0f1a] border border-[#253650] text-xs px-1 py-0.5 rounded focus:outline-none ${slotStatusColor(slot.status)}`}
                                >
                                  {SLOT_STATUSES.map(s => <option key={s}>{s}</option>)}
                                </select>
                              </td>
                              <td className="px-2 py-1">
                                <select
                                  value={slot.vehicle ?? ""}
                                  onChange={e => updateSlot(patrol.id, idx, "vehicle", e.target.value || null)}
                                  className="bg-[#0a0f1a] border border-[#253650] text-gray-300 text-xs px-1 py-0.5 rounded focus:outline-none"
                                >
                                  {VEHICLES.map(v => <option key={v} value={v === "Fahrzeug wählen" ? "" : v}>{v}</option>)}
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
                <div key={o.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-[#1a2744]/30 transition-colors" data-testid={`officer-row-${o.id}`}>
                  <div className="w-7 h-7 rounded-full bg-[#1a2744] border border-[#253650] flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-gray-400 font-medium">{o.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white">{o.dienstnummer}</p>
                    <p className="text-xs text-gray-500">{o.rank}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">{o.status}</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${statusDot(o.status)}`} title={o.status} />
                    <div className={`w-2 h-2 rounded-full ${radioStatusDot(o.radioStatus ?? "")}`} title={o.radioStatus ?? ""} />
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
