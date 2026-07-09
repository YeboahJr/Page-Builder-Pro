import React, { useState, useEffect } from "react";
import {
  useGetDashboardStats,
  useGetCases,
  useGetCase,
  useGetCaseStatusHistory,
  useCreateCase,
  useGetOfficerNames,
  useGetCaseAgents,
  useAddCaseAgent,
  useRemoveCaseAgent,
  getGetCasesQueryKey,
  getGetDashboardStatsQueryKey,
  getGetCaseQueryKey,
  getGetCaseStatusHistoryQueryKey,
  getGetCaseAgentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity, FolderOpen, CheckCircle, Package, AlertTriangle,
  Plus, X, Film, ImageIcon, ZoomIn, Trash2
} from "lucide-react";
import EvidenceUpload, { type UploadFile, uploadEvidenceFiles } from "@/components/EvidenceUpload";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { STRAFTATEN } from "@/lib/straftaten";
import { useAuth } from "@/contexts/AuthContext";
import { hasFullAccess } from "@/lib/ranks";

const CATEGORIES_NEW = ["Gang", "Familie"];
const PRIORITIES_NEW = ["Hoch", "Mittel", "Niedrig"];
const STATUSES_NEW = ["Aktiv", "Offen", "Ermittlungen pausiert", "An STA übergeben", "Abgeschlossen"];
const VERHANDLUNGSFUEHRUNG_OPTIONS = ["Federal Investigation Bureau", "San Andreas Highway Patrol", "Los Santos Police Department"];
interface NewCaseForm {
  caseNumber: string; title: string; category: string; priority: string; status: string; leadAgent: string;
  description: string; details: string;
  verhandlungsfuehrung: string; straftaten: string[]; tatDatum: string; tatWann: string; tatWo: string; tatWer: string;
}
const EMPTY_NEW_CASE: NewCaseForm = {
  caseNumber: "", title: "", category: "Gang", priority: "Mittel", status: "Offen", leadAgent: "", description: "", details: "",
  verhandlungsfuehrung: "Federal Investigation Bureau", straftaten: [], tatDatum: "", tatWann: "", tatWo: "", tatWer: "",
};


function priorityBadge(p: string) {
  const map: Record<string, string> = {
    Hoch: "bg-red-900/60 text-red-400 border border-red-700/50",
    Mittel: "bg-orange-900/60 text-orange-400 border border-orange-700/50",
    Niedrig: "bg-green-900/60 text-green-400 border border-green-700/50",
  };
  return map[p] ?? "bg-gray-800 text-gray-400";
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    "Aktiv": "bg-green-900/60 text-green-400 border border-green-700/50",
    "Offen": "bg-gray-700/60 text-gray-300 border border-gray-600/50",
    "Ermittlungen pausiert": "bg-orange-900/60 text-orange-400 border border-orange-700/50",
    "Observation": "bg-blue-900/60 text-blue-400 border border-blue-700/50",
    "An STA übergeben": "bg-purple-900/60 text-purple-400 border border-purple-700/50",
    "Abgeschlossen": "bg-gray-800/60 text-gray-500 border border-gray-700/50",
  };
  return map[s] ?? "bg-gray-800 text-gray-400";
}

export default function Dashboard() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("Übersicht");
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCaseForm, setNewCaseForm] = useState<NewCaseForm>(EMPTY_NEW_CASE);
  const [newCaseFiles, setNewCaseFiles] = useState<UploadFile[]>([]);
  const [newCaseSubmitting, setNewCaseSubmitting] = useState(false);
  const [newCaseError, setNewCaseError] = useState<string | null>(null);
  const [straftatenOpen, setStraftatenOpen] = useState(false);

  const [evidenceFiles, setEvidenceFiles] = useState<Array<{ filename: string; url: string; type: string; size: number; uploadedAt: string; uploadedBy: string | null }>>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [addEvidenceFiles, setAddEvidenceFiles] = useState<UploadFile[]>([]);
  const [addEvidenceUploading, setAddEvidenceUploading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: stats } = useGetDashboardStats();
  const { data: cases, isLoading: casesLoading } = useGetCases();
  const { data: caseDetail } = useGetCase(selectedId!, {
    query: { enabled: !!selectedId, queryKey: getGetCaseQueryKey(selectedId ?? 0) }
  });
  const { data: statusHistory } = useGetCaseStatusHistory(selectedId!, {
    query: { enabled: !!selectedId && activeTab === "Übersicht", queryKey: getGetCaseStatusHistoryQueryKey(selectedId ?? 0) }
  });

  const createCase = useCreateCase();
  const { data: allOfficers } = useGetOfficerNames();
  const officerNames = [...new Set((allOfficers ?? []).map(o => o.name))].sort((a, b) => a.localeCompare(b, "de"));

  const { officer } = useAuth();
  const { data: caseAgents } = useGetCaseAgents(selectedId!, {
    query: { enabled: !!selectedId && activeTab === "Agenten", queryKey: getGetCaseAgentsQueryKey(selectedId ?? 0) },
  });
  const addCaseAgent = useAddCaseAgent();
  const removeCaseAgent = useRemoveCaseAgent();
  const [addAgentName, setAddAgentName] = useState("");
  const [addAgentRole, setAddAgentRole] = useState("Unterstützender Agent");
  const [agentError, setAgentError] = useState<string | null>(null);
  const canManageAgents = !!caseDetail && (hasFullAccess(officer?.role) || caseDetail.leadAgent === officer?.name);

  const invalidateCaseAgents = (caseId: number) => {
    qc.invalidateQueries({ queryKey: getGetCaseAgentsQueryKey(caseId) });
    qc.invalidateQueries({ queryKey: getGetCaseQueryKey(caseId) });
    qc.invalidateQueries({ queryKey: getGetCasesQueryKey() });
  };

  const handleAddAgent = () => {
    if (!selectedId || !addAgentName) return;
    setAgentError(null);
    addCaseAgent.mutate(
      { id: selectedId, data: { name: addAgentName, role: addAgentRole as "Unterstützender Agent" | "Supervisor" } },
      {
        onSuccess: () => {
          setAddAgentName("");
          invalidateCaseAgents(selectedId);
        },
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } } };
          setAgentError(e?.response?.data?.error ?? "Agent konnte nicht hinzugefügt werden");
        },
      },
    );
  };

  const handleRemoveAgent = (agentId: number) => {
    if (!selectedId) return;
    setAgentError(null);
    removeCaseAgent.mutate(
      { id: selectedId, agentId },
      {
        onSuccess: () => invalidateCaseAgents(selectedId),
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } } };
          setAgentError(e?.response?.data?.error ?? "Agent konnte nicht entfernt werden");
        },
      },
    );
  };

  useEffect(() => {
    if (activeTab !== "Beweismittel" || !selectedId) return;
    setEvidenceLoading(true);
    fetch(`/api/cases/${selectedId}/evidence/files`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("sidms_token") ?? ""}` },
    })
      .then(r => r.json())
      .then(d => setEvidenceFiles(d.files ?? []))
      .catch(() => setEvidenceFiles([]))
      .finally(() => setEvidenceLoading(false));
  }, [activeTab, selectedId]);

  const fetchEvidenceFiles = (caseId: number) => {
    setEvidenceLoading(true);
    fetch(`/api/cases/${caseId}/evidence/files`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("sidms_token") ?? ""}` },
    })
      .then(r => r.json())
      .then(d => setEvidenceFiles(d.files ?? []))
      .catch(() => setEvidenceFiles([]))
      .finally(() => setEvidenceLoading(false));
  };

  const requestDeleteEvidence = (filename: string) => {
    setDeleteError(null);
    setDeleteTarget(filename);
  };

  const confirmDeleteEvidence = async () => {
    if (!selectedId || !deleteTarget) return;
    const filename = deleteTarget;
    setDeletingFile(filename);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/cases/${selectedId}/evidence/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessionStorage.getItem("sidms_token") ?? ""}` },
      });
      if (!res.ok) {
        let message = `Löschen fehlgeschlagen (Status ${res.status}).`;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          // response had no JSON body; keep the status-based message
        }
        setDeleteError(message);
        return;
      }
      setEvidenceFiles(prev => prev.filter(f => f.filename !== filename));
      setDeleteTarget(null);
    } catch {
      setDeleteError("Netzwerkfehler – die Datei konnte nicht gelöscht werden.");
    } finally {
      setDeletingFile(null);
    }
  };

  const handleAddEvidence = async () => {
    if (!selectedId || addEvidenceFiles.length === 0) return;
    setAddEvidenceUploading(true);
    try {
      await uploadEvidenceFiles(selectedId, addEvidenceFiles);
      setAddEvidenceFiles([]);
      setShowAddEvidence(false);
      fetchEvidenceFiles(selectedId);
    } finally {
      setAddEvidenceUploading(false);
    }
  };

  const handleNewCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewCaseSubmitting(true);
    setNewCaseError(null);
    try {
      const created = await createCase.mutateAsync({ data: newCaseForm });
      if (newCaseFiles.length > 0) {
        await uploadEvidenceFiles((created as { id: number }).id, newCaseFiles);
      }
      qc.invalidateQueries({ queryKey: getGetCasesQueryKey() });
      setShowNewCase(false);
      setNewCaseForm(EMPTY_NEW_CASE);
      setStraftatenOpen(false);
      setNewCaseFiles([]);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setNewCaseError(e2?.response?.data?.error ?? "Fall konnte nicht angelegt werden");
    } finally { setNewCaseSubmitting(false); }
  };

  const statCards = [
    { label: "Aktive Fälle", value: stats?.aktiveFaelle ?? 0, delta: stats?.aktiveFaelleDelta, icon: Activity, color: "text-yellow-400", border: "border-yellow-600/30" },
    { label: "Offene Fälle", value: stats?.offeneFaelle ?? 0, delta: stats?.offeneFaelleDelta, icon: FolderOpen, color: "text-blue-400", border: "border-blue-600/30" },
    { label: "Abgeschlossene Fälle", value: stats?.abgeschlosseneFaelle ?? 0, delta: stats?.abgeschlosseneFaelleDelta, icon: CheckCircle, color: "text-green-400", border: "border-green-600/30" },
    { label: "Neue Beweismittel", value: stats?.neueBeweismittel ?? 0, delta: stats?.neueBeweismittelDelta, icon: Package, color: "text-cyan-400", border: "border-cyan-600/30" },
    { label: "Hohe Priorität", value: stats?.hohePrioritaet ?? 0, delta: stats?.hohePrioritaetDelta, icon: AlertTriangle, color: "text-red-400", border: "border-red-600/30" },
  ];

  const TABS = ["Übersicht", "Agenten", "Beweismittel", "Dokumente"];

  const selectedCase = cases?.find(c => c.id === selectedId);

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Image Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-gray-300 z-10" onClick={() => setLightboxUrl(null)}>
            <X className="w-7 h-7" />
          </button>
          <img src={lightboxUrl} alt="Beweismittel" className="max-w-full max-h-full object-contain rounded shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
      {/* Video Player */}
      {videoUrl && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4" onClick={() => setVideoUrl(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-gray-300 z-10" onClick={() => setVideoUrl(null)}>
            <X className="w-7 h-7" />
          </button>
          <video src={videoUrl} controls autoPlay className="max-w-full max-h-full rounded shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
      {/* Delete Evidence Confirmation Modal */}
      <DeleteConfirmModal
        open={!!deleteTarget}
        title="Beweismittel löschen"
        description={deleteTarget ? (
          <>
            Diese Aktion kann nicht rückgängig gemacht werden. Die Datei{" "}
            <span className="text-white font-medium break-all">"{deleteTarget}"</span>{" "}
            wird dauerhaft gelöscht.
          </>
        ) : null}
        busy={!!deletingFile}
        error={deleteError}
        onConfirm={confirmDeleteEvidence}
        onCancel={() => { if (!deletingFile) setDeleteTarget(null); }}
      />
      {/* New Case Modal */}
      {showNewCase && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a] sticky top-0 bg-[#0d1526]">
              <h2 className="text-sm font-semibold text-white">Neuer Fall anlegen</h2>
              <button onClick={() => { setShowNewCase(false); setStraftatenOpen(false); }} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleNewCase} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Fallnummer</label>
                  <input value={newCaseForm.caseNumber} onChange={e => setNewCaseForm(f => ({ ...f, caseNumber: e.target.value }))} placeholder="Leer lassen für automatische Vergabe" className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50 font-mono" data-testid="input-case-number" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Titel *</label>
                  <input required value={newCaseForm.title} onChange={e => setNewCaseForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Kategorie</label>
                  <select value={newCaseForm.category} onChange={e => setNewCaseForm(f => ({ ...f, category: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none">
                    {CATEGORIES_NEW.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Priorität</label>
                  <select value={newCaseForm.priority} onChange={e => setNewCaseForm(f => ({ ...f, priority: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none">
                    {PRIORITIES_NEW.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Status</label>
                  <select value={newCaseForm.status} onChange={e => setNewCaseForm(f => ({ ...f, status: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none">
                    {STATUSES_NEW.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Leitender Agent *</label>
                  <select required value={newCaseForm.leadAgent} onChange={e => setNewCaseForm(f => ({ ...f, leadAgent: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="select-lead-agent-dashboard">
                    <option value="" disabled>Officer auswählen…</option>
                    {newCaseForm.leadAgent && !officerNames.includes(newCaseForm.leadAgent) && <option value={newCaseForm.leadAgent}>{newCaseForm.leadAgent}</option>}
                    {officerNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Verhandlungsführung</label>
                  <select value={newCaseForm.verhandlungsfuehrung} onChange={e => setNewCaseForm(f => ({ ...f, verhandlungsfuehrung: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none" data-testid="select-verhandlungsfuehrung">
                    {VERHANDLUNGSFUEHRUNG_OPTIONS.map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div className="relative">
                  <label className="text-xs text-gray-400 block mb-1">Vorgeworfene Straftaten</label>
                  <button
                    type="button"
                    onClick={() => setStraftatenOpen(v => !v)}
                    className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none text-left flex items-center justify-between gap-2"
                    data-testid="button-straftaten-dropdown"
                  >
                    <span className={`truncate ${newCaseForm.straftaten.length === 0 ? "text-gray-500" : ""}`}>
                      {newCaseForm.straftaten.length === 0 ? "Auswählen…" : `${newCaseForm.straftaten.length} ausgewählt`}
                    </span>
                    <span className="text-gray-500 flex-shrink-0">▾</span>
                  </button>
                  {straftatenOpen && (
                    <div className="absolute z-20 mt-1 w-[28rem] max-w-[80vw] max-h-64 overflow-y-auto bg-[#0a0f1a] border border-[#1e2d4a] rounded shadow-2xl p-2 space-y-0.5" data-testid="dropdown-straftaten">
                      {STRAFTATEN.map(s => (
                        <label key={s} className="flex items-start gap-2 px-2 py-1 rounded hover:bg-[#1a2744]/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newCaseForm.straftaten.includes(s)}
                            onChange={e => setNewCaseForm(f => ({
                              ...f,
                              straftaten: e.target.checked ? [...f.straftaten, s] : f.straftaten.filter(x => x !== s),
                            }))}
                            className="mt-0.5 accent-[#c9a227]"
                          />
                          <span className="text-xs text-gray-300">{s}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {newCaseForm.straftaten.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {newCaseForm.straftaten.map(s => (
                        <span key={s} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#1a2744] border border-[#1e2d4a] rounded text-[10px] text-gray-300">
                          {s.split(" – ")[0]}
                          <button type="button" onClick={() => setNewCaseForm(f => ({ ...f, straftaten: f.straftaten.filter(x => x !== s) }))} className="text-gray-500 hover:text-red-400">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Datum</label>
                  <input type="date" value={newCaseForm.tatDatum} onChange={e => setNewCaseForm(f => ({ ...f, tatDatum: e.target.value }))} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="input-tat-datum" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Wann</label>
                  <input value={newCaseForm.tatWann} onChange={e => setNewCaseForm(f => ({ ...f, tatWann: e.target.value }))} placeholder="z. B. 21:30 Uhr" className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="input-tat-wann" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Wo</label>
                  <input value={newCaseForm.tatWo} onChange={e => setNewCaseForm(f => ({ ...f, tatWo: e.target.value }))} placeholder="Ort" className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="input-tat-wo" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Wer</label>
                  <input value={newCaseForm.tatWer} onChange={e => setNewCaseForm(f => ({ ...f, tatWer: e.target.value }))} placeholder="Beteiligte Personen" className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50" data-testid="input-tat-wer" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Beschreibung</label>
                  <textarea value={newCaseForm.description} onChange={e => setNewCaseForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50 resize-none" data-testid="textarea-beschreibung" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Details</label>
                  <textarea value={newCaseForm.details} onChange={e => setNewCaseForm(f => ({ ...f, details: e.target.value }))} rows={3} className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50 resize-none" data-testid="textarea-details" />
                </div>
                <div className="col-span-2">
                  <EvidenceUpload files={newCaseFiles} onChange={setNewCaseFiles} />
                </div>
              </div>
              {newCaseError && (
                <p className="text-xs text-red-400" data-testid="text-new-case-error">{newCaseError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowNewCase(false); setStraftatenOpen(false); setNewCaseError(null); }} className="flex-1 py-2 bg-[#1e2d4a] text-gray-300 text-sm rounded transition-colors hover:bg-[#253650]">Abbrechen</button>
                <button type="submit" disabled={newCaseSubmitting} className="flex-1 py-2 bg-[#1a3d7c] hover:bg-[#1e4a94] text-white text-sm font-medium rounded transition-colors disabled:opacity-60">
                  {newCaseSubmitting ? "Anlegen..." : "Fall anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3 flex-shrink-0">
        {statCards.map((s, i) => (
          <div key={i} className={`bg-[#0d1526] border ${s.border} rounded p-3 flex items-start gap-3`} data-testid={`stat-card-${i}`}>
            <div className={`p-2 rounded bg-[#0a0f1a] ${s.color}`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 leading-tight">{s.label}</p>
              <p className="text-2xl font-bold text-white leading-tight">{s.value}</p>
              {s.delta !== undefined && (
                <p className={`text-xs ${(s.delta as number) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {(s.delta as number) >= 0 ? "+" : ""}{s.delta} seit letzter Woche
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Case table + detail */}
        <div className="flex-1 flex flex-col min-w-0 gap-4">
          {/* Case table */}
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d4a]">
              <h2 className="text-sm font-semibold text-white">Fallübersicht</h2>
              <button
                onClick={() => setShowNewCase(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1a3d7c]/60 hover:bg-[#1a3d7c] border border-[#2a5bb0]/50 text-blue-300 rounded transition-colors"
                data-testid="button-new-case"
              >
                <Plus className="w-3.5 h-3.5" />
                Neuer Fall
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e2d4a] bg-[#0a0f1a]">
                    {["Fallnummer", "Titel", "Kategorie", "Priorität", "Status", "Leitender Agent", "Letzte Änderung"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {casesLoading ? (
                    <tr><td colSpan={7} className="text-center py-6 text-gray-500">Laden...</td></tr>
                  ) : cases?.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => { setSelectedId(c.id); setActiveTab("Übersicht"); setShowAddEvidence(false); setAddEvidenceFiles([]); }}
                      className={`border-b border-[#1e2d4a]/50 cursor-pointer transition-colors hover:bg-[#1a2744]/50 ${selectedId === c.id ? "bg-[#1a2744]" : ""}`}
                      data-testid={`row-case-${c.id}`}
                    >
                      <td className="px-3 py-2 text-gray-300 font-mono whitespace-nowrap">{c.caseNumber}</td>
                      <td className="px-3 py-2 text-white whitespace-nowrap max-w-[160px] truncate">{c.title}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{c.category}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityBadge(c.priority)}`}>{c.priority}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${statusBadge(c.status)}`}>{c.status}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{c.leadAgent}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.lastModified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Case detail */}
          {selectedId && (
            <div className="bg-[#0d1526] border border-[#1e2d4a] rounded flex flex-col">
              <div className="px-4 py-3 border-b border-[#1e2d4a]">
                <p className="text-xs text-gray-400">Fallakte: <span className="text-[#c9a227] font-mono">{selectedCase?.caseNumber}</span> – {selectedCase?.title}</p>
              </div>
              {/* Tabs */}
              <div className="flex border-b border-[#1e2d4a] overflow-x-auto">
                {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-2 text-xs whitespace-nowrap transition-colors ${activeTab === tab ? "text-[#c9a227] border-b-2 border-[#c9a227]" : "text-gray-400 hover:text-white"}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {/* Tab content */}
              <div className="p-4">
                {activeTab === "Übersicht" && caseDetail && (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Allgemeine Informationen</h3>
                      {[
                        ["Fallnummer", caseDetail.caseNumber],
                        ["Titel", caseDetail.title],
                        ["Kategorie", caseDetail.category],
                        ["Priorität", caseDetail.priority],
                        ["Status", caseDetail.status],
                        ["Zuständiger Agent", caseDetail.leadAgent],
                        ["Verhandlungsführung", caseDetail.verhandlungsfuehrung ?? "–"],
                        ["Datum", caseDetail.tatDatum ?? "–"],
                        ["Wann", caseDetail.tatWann ?? "–"],
                        ["Wo", caseDetail.tatWo ?? "–"],
                        ["Wer", caseDetail.tatWer ?? "–"],
                        ["Erstellungsdatum", caseDetail.createdAt],
                        ["Letzte Änderung", caseDetail.lastModified],
                        ["Abschlussdatum", caseDetail.closedAt ?? "–"],
                      ].map(([label, val]) => (
                        <div key={label} className="flex gap-3 text-xs">
                          <span className="text-gray-500 w-36 flex-shrink-0">{label}</span>
                          <span className={`text-gray-200 ${label === "Priorität" ? "" : ""}`}>
                            {label === "Priorität"
                              ? <span className={`px-2 py-0.5 rounded ${priorityBadge(val as string)}`}>{val}</span>
                              : label === "Status"
                              ? <span className={`px-2 py-0.5 rounded ${statusBadge(val as string)}`}>{val}</span>
                              : val}
                          </span>
                        </div>
                      ))}
                      {(caseDetail.straftaten?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Vorgeworfene Straftaten</p>
                          <div className="flex flex-wrap gap-1">
                            {caseDetail.straftaten?.map(s => (
                              <span key={s} className="px-1.5 py-0.5 bg-[#1a2744] border border-[#1e2d4a] rounded text-[10px] text-gray-300">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {caseDetail.description && (
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Beschreibung</p>
                          <p className="text-xs text-gray-300 whitespace-pre-wrap">{caseDetail.description}</p>
                        </div>
                      )}
                      {caseDetail.details && (
                        <div>
                          <p className="text-gray-500 text-xs mb-1">Details</p>
                          <p className="text-xs text-gray-300 whitespace-pre-wrap">{caseDetail.details}</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Beteiligte Agenten</h3>
                        <p className="text-xs text-gray-300">Leitender Agent: {caseDetail.leadAgent}</p>
                        {(caseDetail.supportingAgents?.length ?? 0) > 0 && (
                          <p className="text-xs text-gray-400 mt-1">Unterstützende Agenten: {caseDetail.supportingAgents?.join(", ")}</p>
                        )}
                        {caseDetail.supervisor && (
                          <p className="text-xs text-gray-400 mt-1">Supervisor: {caseDetail.supervisor}</p>
                        )}
                      </div>
                      {/* Status history */}
                      {statusHistory && statusHistory.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Status-Verlauf</h3>
                          <div className="space-y-2">
                            {statusHistory.slice(0, 4).map(h => (
                              <div key={h.id} className="flex items-start gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#c9a227] mt-1 flex-shrink-0" />
                                <div>
                                  <p className="text-xs text-gray-300">{new Date(h.timestamp).toLocaleString("de-DE")}</p>
                                  <p className="text-xs text-gray-400">Status geändert von <span className="text-white">{h.fromStatus}</span> zu <span className="text-[#c9a227]">{h.toStatus}</span></p>
                                  <p className="text-xs text-gray-500">{h.changedBy}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {activeTab === "Agenten" && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Beteiligte Agenten</h3>
                    {agentError && (
                      <p className="text-xs text-red-400 mb-3" data-testid="text-agent-error">{agentError}</p>
                    )}
                    {!caseAgents ? (
                      <p className="text-xs text-gray-500 py-4 text-center">Laden...</p>
                    ) : caseAgents.length === 0 ? (
                      <p className="text-xs text-gray-500 py-4 text-center">Keine Agenten zugewiesen.</p>
                    ) : (
                      <div className="space-y-1.5 mb-4">
                        {caseAgents.map(a => (
                          <div key={a.id} className="flex items-center justify-between bg-[#0a0f1a] border border-[#1e2d4a] rounded px-3 py-2" data-testid={`row-case-agent-${a.id}`}>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-200">{a.name}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] border ${a.role === "Leitender Agent" ? "bg-[#c9a227]/15 text-[#c9a227] border-[#c9a227]/40" : a.role === "Supervisor" ? "bg-purple-900/40 text-purple-300 border-purple-700/50" : "bg-[#1a2744] text-gray-400 border-[#1e2d4a]"}`}>
                                {a.role}
                              </span>
                            </div>
                            {canManageAgents && a.role !== "Leitender Agent" && (
                              <button
                                onClick={() => handleRemoveAgent(a.id)}
                                disabled={removeCaseAgent.isPending}
                                className="text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                                title="Agent entfernen"
                                data-testid={`button-remove-agent-${a.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {canManageAgents ? (
                      <div className="p-3 bg-[#0a0f1a] border border-[#1e2d4a] rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Agent hinzufügen</p>
                        <div className="flex gap-2">
                          <select
                            value={addAgentName}
                            onChange={e => setAddAgentName(e.target.value)}
                            className="flex-1 bg-[#0d1526] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-[#c9a227]/50"
                            data-testid="select-add-agent-name"
                          >
                            <option value="">Officer auswählen...</option>
                            {officerNames
                              .filter(n => n !== caseDetail?.leadAgent && !(caseAgents ?? []).some(a => a.name === n && a.role !== "Ersteller"))
                              .map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <select
                            value={addAgentRole}
                            onChange={e => setAddAgentRole(e.target.value)}
                            className="bg-[#0d1526] border border-[#1e2d4a] text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-[#c9a227]/50"
                            data-testid="select-add-agent-role"
                          >
                            <option value="Unterstützender Agent">Unterstützender Agent</option>
                            <option value="Supervisor">Supervisor</option>
                          </select>
                          <button
                            onClick={handleAddAgent}
                            disabled={!addAgentName || addCaseAgent.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1a3d7c]/60 hover:bg-[#1a3d7c] border border-[#2a5bb0]/50 text-blue-300 rounded transition-colors disabled:opacity-50"
                            data-testid="button-add-agent"
                          >
                            <Plus className="w-3 h-3" />
                            Hinzufügen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-600">Nur der leitende Agent oder die Leitung kann Agenten verwalten.</p>
                    )}
                  </div>
                )}
                {activeTab === "Beweismittel" && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Hochgeladene Beweismittel</h3>
                      <button
                        onClick={() => { setShowAddEvidence(v => !v); setAddEvidenceFiles([]); }}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#1a3d7c]/60 hover:bg-[#1a3d7c] border border-[#2a5bb0]/50 text-blue-300 rounded transition-colors"
                        data-testid="button-upload-evidence"
                      >
                        <Plus className="w-3 h-3" />
                        Hochladen
                      </button>
                    </div>
                    {showAddEvidence && (
                      <div className="mb-4 p-3 bg-[#0a0f1a] border border-[#1e2d4a] rounded-lg">
                        <EvidenceUpload files={addEvidenceFiles} onChange={setAddEvidenceFiles} />
                        <div className="flex gap-2 mt-3">
                          <button
                            type="button"
                            onClick={() => { setShowAddEvidence(false); setAddEvidenceFiles([]); }}
                            className="flex-1 py-1.5 bg-[#1e2d4a] text-gray-300 text-xs rounded transition-colors hover:bg-[#253650]"
                          >
                            Abbrechen
                          </button>
                          <button
                            type="button"
                            onClick={handleAddEvidence}
                            disabled={addEvidenceUploading || addEvidenceFiles.length === 0}
                            className="flex-1 py-1.5 bg-[#1a3d7c] hover:bg-[#1e4a94] text-white text-xs font-medium rounded transition-colors disabled:opacity-60"
                          >
                            {addEvidenceUploading ? "Hochladen..." : `${addEvidenceFiles.length} Datei${addEvidenceFiles.length !== 1 ? "en" : ""} hochladen`}
                          </button>
                        </div>
                      </div>
                    )}
                    {evidenceLoading ? (
                      <p className="text-xs text-gray-500 py-4 text-center">Laden...</p>
                    ) : evidenceFiles.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <ImageIcon className="w-8 h-8 text-gray-700" />
                        <p className="text-xs text-gray-500">Keine Beweismittel vorhanden.</p>
                        <p className="text-[10px] text-gray-600">Klicken Sie auf "Hochladen", um Bilder und Videos hinzuzufügen.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-3">
                        {evidenceFiles.map((f, i) => (
                          <div key={i} className="group relative rounded-lg overflow-hidden bg-[#0a0f1a] border border-[#1e2d4a] hover:border-[#c9a227]/40 transition-colors">
                            {/* Delete button — appears on hover */}
                            <button
                              onClick={e => { e.stopPropagation(); requestDeleteEvidence(f.filename); }}
                              disabled={deletingFile === f.filename}
                              className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 hover:bg-red-900/80 text-red-400 hover:text-red-300 rounded p-0.5 disabled:opacity-50"
                              title="Beweismittel löschen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            {f.type === "image" ? (
                              <div className="relative cursor-pointer" onClick={() => setLightboxUrl(f.url)}>
                                <img src={f.url} alt={f.filename} className="w-full h-24 object-cover" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                  <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1">
                                  <p className="text-[9px] text-gray-300 truncate">{f.filename}</p>
                                </div>
                              </div>
                            ) : f.type === "video" ? (
                              <div className="relative cursor-pointer" onClick={() => setVideoUrl(f.url)}>
                                <div className="w-full h-24 flex flex-col items-center justify-center gap-1 bg-[#0a1020]">
                                  <Film className="w-6 h-6 text-blue-400" />
                                  <span className="text-[9px] text-gray-500 px-1 truncate w-full text-center">{f.filename}</span>
                                </div>
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-white text-xs ml-0.5">▶</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="w-full h-24 flex flex-col items-center justify-center gap-1">
                                <ImageIcon className="w-5 h-5 text-gray-500" />
                                <p className="text-[9px] text-gray-500 truncate px-1">{f.filename}</p>
                              </div>
                            )}
                            <div className="px-1.5 py-1 border-t border-[#1e2d4a] space-y-0.5">
                              <p className="text-[9px] text-gray-400 truncate" title={f.uploadedBy ?? "Unbekannt"}>{f.uploadedBy ?? "Unbekannt"}</p>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[9px] text-gray-600">{new Date(f.uploadedAt).toLocaleDateString("de-DE")}</span>
                                <span className="text-[9px] text-gray-600">{(f.size / 1024).toFixed(0)} KB</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {!["Übersicht", "Agenten", "Beweismittel"].includes(activeTab) && (
                  <p className="text-xs text-gray-500 py-4 text-center">Keine Daten für diesen Bereich vorhanden.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Verknüpfungen */}
        {selectedId && (
          <div className="w-72 flex-shrink-0 space-y-3">
            <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-4">
              <h3 className="text-xs font-semibold text-white mb-2">Verknüpfungen</h3>
              {[
                { label: "Personalverwaltung", color: "bg-green-500" },
                { label: "Streifenverwaltung", color: "bg-blue-500" },
                { label: "ID-Change-System", color: "bg-yellow-500" },
                { label: "Audit-Log", color: "bg-purple-500" },
                { label: "Archiv", color: "bg-gray-500" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2 py-1">
                  <span className={`w-2 h-2 rounded-full ${l.color}`} />
                  <span className="text-xs text-gray-300 hover:text-[#c9a227] cursor-pointer transition-colors">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
