import React, { useState, useRef, useEffect } from "react";
import {
  useGetPatrols,
  useGetOfficers,
  useUpdatePatrol,
  getGetPatrolsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Loader2, Users } from "lucide-react";

const PATROL_TYPES = ["Regelstreife", "Undercoverstreife", "Zivilstreife", "Overwatch"];
const STATUS_META: Record<string, { text: string; dot: string }> = {
  "Code 1": { text: "text-green-400", dot: "bg-green-500" },
  "MD-Dienst": { text: "text-blue-400", dot: "bg-blue-500" },
  "Geiselnahme": { text: "text-red-400", dot: "bg-red-500" },
  "Event": { text: "text-purple-400", dot: "bg-purple-500" },
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
const VEHICLES = ["Auswahl", "Streifenwagen 1", "Streifenwagen 2", "SUV", "Motorrad", "Zivilfahrzeug"];

const TEN_CODES: { label: string; code: string }[] = [
  { label: "Verstanden", code: "10-4" },
  { label: "Funkspruch wiederholen", code: "10-5" },
  { label: "Ich/Wir sind eine Geisel", code: "10-6" },
  { label: "Bereit für Zugriff", code: "10-10" },
  { label: "Aktuelle Position", code: "10-20" },
  { label: "Status Lokaler/Globaler", code: "10-30" },
  { label: "Verstärkung", code: "10-34" },
  { label: "Korruptionsfall", code: "10-50" },
  { label: "Geiselnahme", code: "10-60" },
  { label: "Personenkontrolle", code: "10-70" },
  { label: "Verfolgung", code: "10-80" },
  { label: "Agent in Not", code: "11-99" },
  { label: "Frei auf Streife", code: "Code 1" },
  { label: "Anfahren ohne Martinshorn", code: "Code 2" },
  { label: "Anfahren mit Sondersignal", code: "Code 3" },
  { label: "Einsatz beendet", code: "Code 4" },
];

const MIRANDA_TEXT =
  "\u201eSie haben das Recht zu schweigen. Alles, was Sie sagen kann und wird vor Gericht gegen Sie verwendet werden. Sie haben das Recht einen Anwalt zurate zu ziehen, diesen müssen sie innerhalb von 3 Minuten bennen. Falls Sie sich keinen leisten können, wird Ihnen einer gestellt. Haben Sie Ihre Rechte verstanden?\u201c";

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
  notes: string | null;
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
  const [savingCount, setSavingCount] = useState(0);
  const [saveError, setSaveError] = useState(false);

  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // Latest local edit per patrol — kept in a ref so rapid successive edits in the
  // same tick accumulate correctly and the debounced save always sends the newest snapshot.
  const latestDraftRef = useRef<Record<number, PatrolDraft>>({});
  const savingRef = useRef<Record<number, boolean>>({});
  // Monotonic revision per patrol: bumped on every edit, recorded when a save acks.
  // The draft is only cleared once the acked revision matches the current one, so an
  // edit made while a save is in flight can never be silently dropped.
  const revisionRef = useRef<Record<number, number>>({});
  const savedRevisionRef = useRef<Record<number, number>>({});

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
    };
  }, []);

  const deriveDraft = (patrolId: number): PatrolDraft => {
    const p = patrols?.find(x => x.id === patrolId);
    return {
      patrolType: p?.patrolType ?? "Regelstreife",
      status: p?.status ?? DEFAULT_STATUS,
      vehicle: p?.vehicle ?? null,
      notes: p?.notes ?? null,
      slots: (p?.slots as PatrolSlot[]) ?? [],
    };
  };

  const getDraft = (patrolId: number): PatrolDraft => drafts[patrolId] ?? deriveDraft(patrolId);

  // Serialized per-patrol save: never runs two PATCHes for the same patrol concurrently,
  // and always sends the latest snapshot, so completions can't arrive out of order.
  const runSave = async (patrolId: number) => {
    if (savingRef.current[patrolId]) return;
    savingRef.current[patrolId] = true;
    setSavingCount(c => c + 1);
    try {
      // Re-save while newer revisions keep arriving during the awaits.
      while (true) {
        const rev = revisionRef.current[patrolId] ?? 0;
        if (savedRevisionRef.current[patrolId] === rev) break;
        const draft = latestDraftRef.current[patrolId];
        if (!draft) break;
        const updated = await updatePatrol.mutateAsync({
          id: patrolId,
          data: {
            patrolType: draft.patrolType,
            status: draft.status,
            vehicle: draft.vehicle,
            notes: draft.notes,
            slots: draft.slots,
          },
        });
        savedRevisionRef.current[patrolId] = rev;
        qc.setQueryData(getGetPatrolsQueryKey(), (old: typeof patrols) =>
          old ? old.map(p => (p.id === patrolId ? (updated as typeof p) : p)) : old,
        );
      }
      setSaveError(false);
      // Drop the local draft only when fully synced (no newer unsaved revision), so the
      // reconciled server cache becomes the source of truth again without losing edits.
      if ((revisionRef.current[patrolId] ?? 0) === (savedRevisionRef.current[patrolId] ?? -1)) {
        delete latestDraftRef.current[patrolId];
        setDrafts(prev => {
          const { [patrolId]: _removed, ...rest } = prev;
          return rest;
        });
      }
    } catch {
      setSaveError(true);
    } finally {
      savingRef.current[patrolId] = false;
      setSavingCount(c => c - 1);
    }
  };

  const scheduleSave = (patrolId: number) => {
    if (saveTimers.current[patrolId]) clearTimeout(saveTimers.current[patrolId]);
    saveTimers.current[patrolId] = setTimeout(() => {
      delete saveTimers.current[patrolId];
      void runSave(patrolId);
    }, 500);
  };

  const commitDraft = (patrolId: number, next: PatrolDraft) => {
    latestDraftRef.current[patrolId] = next;
    revisionRef.current[patrolId] = (revisionRef.current[patrolId] ?? 0) + 1;
    setDrafts(prev => ({ ...prev, [patrolId]: next }));
    scheduleSave(patrolId);
  };

  const patchDraft = (patrolId: number, partial: Partial<PatrolDraft>) => {
    const base = latestDraftRef.current[patrolId] ?? deriveDraft(patrolId);
    commitDraft(patrolId, { ...base, ...partial });
  };

  const updateSlot = (patrolId: number, slotIdx: number, partial: Partial<PatrolSlot>) => {
    const base = latestDraftRef.current[patrolId] ?? deriveDraft(patrolId);
    const slots = base.slots.map((s, i) => (i === slotIdx ? { ...s, ...partial } : s));
    commitDraft(patrolId, { ...base, slots });
  };

  const hasUnsaved = Object.keys(drafts).length > 0;
  const isSaving = savingCount > 0;

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
        <div
          className={`flex items-center gap-1.5 text-xs ${saveError ? "text-red-400" : "text-gray-400"}`}
          data-testid="autosave-status"
        >
          {saveError ? (
            <>
              <AlertCircle className="w-3.5 h-3.5" />
              Speichern fehlgeschlagen
            </>
          ) : isSaving || hasUnsaved ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Speichert…
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 text-green-500" />
              Automatisch gespeichert
            </>
          )}
        </div>
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
                          <option value="">Auswahl</option>
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
                          <option value="">Auswahl</option>
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
                            <option key={v} value={v === "Auswahl" ? "" : v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {draft.slots.map((slot, idx) => (
                          <div
                            key={idx}
                            className="border border-[#1e2d4a]/60 rounded bg-[#0a0f1a]/40 p-2 flex flex-col gap-1.5"
                            data-testid={`slot-${patrol.id}-${idx}`}
                          >
                            <span className="text-[10px] uppercase tracking-wide text-gray-500 font-mono">
                              Position {slot.position}
                            </span>
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
                              className="bg-[#0a0f1a] border border-[#253650] text-gray-300 text-xs px-1 py-1 rounded focus:outline-none w-full"
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
                        ))}
                      </div>

                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">Notizen</span>
                        <textarea
                          value={draft.notes ?? ""}
                          onChange={e => patchDraft(patrol.id, { notes: e.target.value || null })}
                          placeholder="Notizen zur Streife…"
                          rows={4}
                          className="bg-[#0a0f1a] border border-[#253650] text-gray-300 text-xs px-2 py-1.5 rounded focus:outline-none w-full resize-y min-h-[80px]"
                          data-testid={`textarea-notes-${patrol.id}`}
                        />
                      </label>
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

          </div>

          {/* Ten Codes */}
          <div className="mt-4 bg-[#0d1526] border border-[#1e2d4a] rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1e2d4a] bg-[#0a0f1a]">
              <h2 className="text-sm font-bold text-white text-center tracking-wide">Ten Codes</h2>
            </div>
            <div className="px-4 py-3 divide-y divide-[#1e2d4a]/40">
              {TEN_CODES.map(c => (
                <div key={c.code} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-gray-300">{c.label}</span>
                  <span className="text-[#c9a227] font-mono font-semibold">{c.code}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rechte des Bürgers (Miranda) */}
          <div className="mt-4 bg-[#0d1526] border border-[#1e2d4a] rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1e2d4a] bg-[#0a0f1a]">
              <h2 className="text-sm font-bold text-white text-center tracking-wide">
                Rechte des Bürgers <span className="italic font-medium text-gray-300">(Miranda)</span>
              </h2>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-gray-300 italic leading-relaxed text-center">{MIRANDA_TEXT}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
