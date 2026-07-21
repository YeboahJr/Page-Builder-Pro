import React, { useState } from "react";
import {
  useGetRazziaAntraege,
  useCreateRazziaAntrag,
  useUpdateRazziaAntrag,
  useDeleteRazziaAntrag,
  useGetCases,
  getGetRazziaAntraegeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Pencil, Trash2, Download, ExternalLink } from "lucide-react";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";

interface RazziaSectionProps {
  /** Erstellen-Modal von außen öffnen (Button "Razzia Antrag" im Dashboard). */
  createOpen: boolean;
  onCreateClose: () => void;
}

// Abschnitt "Razzia Anträge" (nur Direktion/Leitung): Liste der Anträge auf
// Durchsuchungsbefehl mit Bearbeiten/Löschen und Google-Doc-Erzeugung.
export default function RazziaSection({ createOpen, onCreateClose }: RazziaSectionProps) {
  const qc = useQueryClient();
  const { data: antraege, isLoading } = useGetRazziaAntraege();
  const { data: allCases } = useGetCases();
  const closedCases = (allCases ?? []).filter(c => c.status === "Abgeschlossen");

  const createAntrag = useCreateRazziaAntrag();
  const updateAntrag = useUpdateRazziaAntrag();
  const deleteAntrag = useDeleteRazziaAntrag();

  const [editId, setEditId] = useState<number | null>(null);
  const [target, setTarget] = useState("");
  const [caseIds, setCaseIds] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const modalOpen = createOpen || editId !== null;

  const openEdit = (a: { id: number; target: string; caseIds: number[] }) => {
    setEditId(a.id);
    setTarget(a.target);
    setCaseIds(a.caseIds);
    setFormError(null);
  };

  const closeModal = () => {
    setEditId(null);
    setTarget("");
    setCaseIds([]);
    setFormError(null);
    onCreateClose();
  };

  const toggleCase = (id: number, checked: boolean) => {
    setCaseIds(prev => (checked ? [...prev, id] : prev.filter(x => x !== id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editId !== null) {
        await updateAntrag.mutateAsync({ id: editId, data: { target, caseIds } });
      } else {
        await createAntrag.mutateAsync({ data: { target, caseIds } });
      }
      qc.invalidateQueries({ queryKey: getGetRazziaAntraegeQueryKey() });
      closeModal();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setFormError(e2?.response?.data?.error ?? "Antrag konnte nicht gespeichert werden");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteId === null) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteAntrag.mutateAsync({ id: deleteId });
      qc.invalidateQueries({ queryKey: getGetRazziaAntraegeQueryKey() });
      setDeleteId(null);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setDeleteError(e2?.response?.data?.error ?? "Antrag konnte nicht gelöscht werden");
    } finally {
      setDeleteBusy(false);
    }
  };

  // Erzeugt den Antrag als Google-Docs-Dokument (wie die Akte) und öffnet
  // bzw. lädt ihn herunter.
  const handleDokument = async (id: number, mode: "download" | "open") => {
    setDocBusy(`${id}-${mode}`);
    setDocError(null);
    const win = mode === "open" ? window.open("", "_blank") : null;
    try {
      const res = await fetch(`/api/razzia-antraege/${id}/dokument`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("sidms_token") ?? ""}` },
      });
      if (!res.ok) {
        let message = "Antrag konnte nicht erstellt werden.";
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          // keine JSON-Antwort; Standardmeldung behalten
        }
        setDocError(message);
        win?.close();
        return;
      }
      const doc: { url: string; exportUrl: string } = await res.json();
      if (mode === "open") {
        if (win) {
          win.location.href = doc.url;
        } else {
          window.open(doc.url, "_blank");
        }
      } else {
        const a = document.createElement("a");
        a.href = doc.exportUrl;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch {
      setDocError("Netzwerkfehler – Antrag konnte nicht erstellt werden.");
      win?.close();
    } finally {
      setDocBusy(null);
    }
  };

  const antragToDelete = (antraege ?? []).find(a => a.id === deleteId);

  return (
    <div className="bg-[#0d1526] border border-[#1e2d4a] rounded flex flex-col flex-shrink-0">
      {/* Erstellen/Bearbeiten-Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1526] border border-[#1e2d4a] rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a] sticky top-0 bg-[#0d1526]">
              <h2 className="text-sm font-semibold text-white">
                {editId !== null ? "Razzia Antrag bearbeiten" : "Razzia Antrag erstellen"}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-white" data-testid="button-close-razzia-modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Antrag auf Durchsuchungsbefehl *</label>
                <input
                  required
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  placeholder="Gegen wen? z. B. Gang Los Santos Vagos"
                  className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-[#c9a227]/50"
                  data-testid="input-razzia-target"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Abgeschlossene Akten anhängen *</label>
                {closedCases.length === 0 ? (
                  <p className="text-xs text-gray-500 border border-[#1e2d4a] rounded px-3 py-2 bg-[#0a0f1a]">
                    Keine abgeschlossenen Akten vorhanden.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto bg-[#0a0f1a] border border-[#1e2d4a] rounded p-2 space-y-0.5" data-testid="dropdown-razzia-cases">
                    {closedCases.map(c => (
                      <label key={c.id} className="flex items-start gap-2 px-2 py-1 rounded hover:bg-[#1a2744]/60 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={caseIds.includes(c.id)}
                          onChange={e => toggleCase(c.id, e.target.checked)}
                          className="mt-0.5 accent-[#c9a227]"
                        />
                        <span className="text-xs text-gray-300">
                          <span className="font-mono text-gray-400">{c.caseNumber}</span> – {c.title}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {formError && <p className="text-xs text-red-400" data-testid="text-razzia-error">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 py-2 bg-[#1e2d4a] text-gray-300 text-sm rounded transition-colors hover:bg-[#253650]">
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={submitting || caseIds.length === 0}
                  className="flex-1 py-2 bg-[#1a3d7c] hover:bg-[#1e4a94] text-white text-sm font-medium rounded transition-colors disabled:opacity-60"
                  data-testid="button-razzia-submit"
                >
                  {submitting ? "Speichern..." : editId !== null ? "Speichern" : "Erstellen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Löschen-Bestätigung */}
      <DeleteConfirmModal
        open={deleteId !== null}
        title="Razzia Antrag löschen"
        description={antragToDelete ? (
          <>
            Diese Aktion kann nicht rückgängig gemacht werden. Der Antrag gegen{" "}
            <span className="text-white font-medium break-all">"{antragToDelete.target}"</span>{" "}
            wird dauerhaft gelöscht.
          </>
        ) : null}
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleteBusy) setDeleteId(null); }}
      />

      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d4a]">
        <h2 className="text-sm font-semibold text-white">Razzia Anträge</h2>
        {docError && <span className="text-[10px] text-red-400">{docError}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1e2d4a] bg-[#0a0f1a]">
              {["Antrag gegen", "Angehängte Akten", "Erstellt von", "Erstellt am", "Aktionen"].map(h => (
                <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-6 text-gray-500">Laden...</td></tr>
            ) : (antraege ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-gray-500" data-testid="text-razzia-empty">
                  Keine Razzia Anträge vorhanden.
                </td>
              </tr>
            ) : (antraege ?? []).map(a => (
              <tr key={a.id} className="border-b border-[#1e2d4a]/50" data-testid={`row-razzia-${a.id}`}>
                <td className="px-3 py-2 text-white whitespace-nowrap max-w-[220px] truncate">{a.target}</td>
                <td className="px-3 py-2 text-gray-300">
                  <div className="flex flex-wrap gap-1">
                    {(a.cases ?? []).map(c => (
                      <span key={c.id} className="px-1.5 py-0.5 bg-[#1a2744] border border-[#1e2d4a] rounded text-[10px] font-mono text-gray-300">
                        {c.caseNumber}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{a.createdBy ?? "–"}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {new Date(a.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDokument(a.id, "download")}
                      disabled={docBusy !== null}
                      title="Antrag herunterladen"
                      className="flex items-center gap-1 px-2 py-1 bg-[#1a3d7c]/60 hover:bg-[#1a3d7c] border border-[#2a5bb0]/50 text-blue-300 rounded transition-colors disabled:opacity-50"
                      data-testid={`button-razzia-download-${a.id}`}
                    >
                      <Download className="w-3 h-3" />
                      {docBusy === `${a.id}-download` ? "Wird erstellt..." : "Herunterladen"}
                    </button>
                    <button
                      onClick={() => handleDokument(a.id, "open")}
                      disabled={docBusy !== null}
                      title="Antrag öffnen"
                      className="flex items-center gap-1 px-2 py-1 bg-[#1a3d7c]/60 hover:bg-[#1a3d7c] border border-[#2a5bb0]/50 text-blue-300 rounded transition-colors disabled:opacity-50"
                      data-testid={`button-razzia-open-${a.id}`}
                    >
                      <ExternalLink className="w-3 h-3" />
                      {docBusy === `${a.id}-open` ? "Wird erstellt..." : "Öffnen"}
                    </button>
                    <button
                      onClick={() => openEdit(a)}
                      title="Bearbeiten"
                      className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-[#1a2744] transition-colors"
                      data-testid={`button-razzia-edit-${a.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setDeleteError(null); setDeleteId(a.id); }}
                      title="Löschen"
                      className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-[#1a2744] transition-colors"
                      data-testid={`button-razzia-delete-${a.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
