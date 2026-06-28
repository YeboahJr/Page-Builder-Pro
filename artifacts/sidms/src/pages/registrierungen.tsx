import React, { useState } from "react";
import { UserPlus, ShieldAlert, Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPendingOfficers,
  useApproveOfficer,
  useRejectOfficer,
  getGetPendingOfficersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { RANK_NAMES, isLeadership } from "@/lib/ranks";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_RANK = "Agent";

export default function Registrierungen() {
  const { officer } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const leadership = isLeadership(officer?.rank);

  const { data: pending, isLoading, isError } = useGetPendingOfficers({
    query: { enabled: leadership, queryKey: getGetPendingOfficersQueryKey() },
  });
  const approveMutation = useApproveOfficer();
  const rejectMutation = useRejectOfficer();
  const [ranks, setRanks] = useState<Record<number, string>>({});

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetPendingOfficersQueryKey() });

  const handleApprove = async (id: number) => {
    const rank = ranks[id] ?? DEFAULT_RANK;
    try {
      await approveMutation.mutateAsync({ id, data: { rank } });
      toast({ title: "Freigegeben", description: `Officer wurde als „${rank}" freigegeben.` });
      refresh();
    } catch {
      toast({ title: "Fehler", description: "Freigabe fehlgeschlagen.", variant: "destructive" });
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectMutation.mutateAsync({ id });
      toast({ title: "Abgelehnt", description: "Registrierung wurde abgelehnt." });
      refresh();
    } catch {
      toast({ title: "Fehler", description: "Ablehnung fehlgeschlagen.", variant: "destructive" });
    }
  };

  if (!leadership) {
    return (
      <div className="max-w-2xl">
        <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-6 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <p className="text-sm text-gray-300">
            Nur Leitungsränge dürfen Registrierungen verwalten.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <UserPlus className="w-5 h-5 text-[#c9a227]" />
        <div>
          <h1 className="text-base font-semibold text-white">Registrierungen</h1>
          <p className="text-xs text-gray-400">Offene Anträge auf Zugang freigeben oder ablehnen.</p>
        </div>
      </div>

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded">
        {isLoading && <p className="text-sm text-gray-400 p-5">Lade Registrierungen…</p>}
        {isError && <p className="text-sm text-red-400 p-5">Registrierungen konnten nicht geladen werden.</p>}
        {!isLoading && !isError && (pending?.length ?? 0) === 0 && (
          <p className="text-sm text-gray-400 p-5" data-testid="text-no-pending">
            Keine offenen Registrierungen.
          </p>
        )}
        {!isLoading && !isError && (pending?.length ?? 0) > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-[#1e2d4a]">
                <th className="px-4 py-3 font-medium">Dienstnummer</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Rang zuweisen</th>
                <th className="px-4 py-3 font-medium text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {pending!.map(o => {
                const busy = approveMutation.isPending || rejectMutation.isPending;
                return (
                  <tr key={o.id} className="border-b border-[#1e2d4a]/50" data-testid={`row-pending-${o.id}`}>
                    <td className="px-4 py-3 text-gray-200">{o.dienstnummer}</td>
                    <td className="px-4 py-3 text-gray-200">{o.name}</td>
                    <td className="px-4 py-3">
                      <select
                        className="bg-[#0a1020] text-gray-200 border border-[#1e2d4a] rounded px-2 py-1.5 text-xs w-52"
                        value={ranks[o.id] ?? DEFAULT_RANK}
                        onChange={e => setRanks(prev => ({ ...prev, [o.id]: e.target.value }))}
                        data-testid={`select-rank-${o.id}`}
                      >
                        {RANK_NAMES.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleApprove(o.id)}
                          disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-green-600/15 text-green-400 hover:bg-green-600/25 transition-colors disabled:opacity-50"
                          data-testid={`button-approve-${o.id}`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          Freigeben
                        </button>
                        <button
                          onClick={() => handleReject(o.id)}
                          disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                          data-testid={`button-reject-${o.id}`}
                        >
                          <X className="w-3.5 h-3.5" />
                          Ablehnen
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
