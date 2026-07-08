import React, { useState } from "react";
import { Shield, ShieldAlert, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOfficers,
  useUpdateOfficerPages,
  getGetOfficersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { isLeadership } from "@/lib/ranks";
import { PAGE_DEFS, ALL_PAGE_KEYS } from "@/lib/pages";
import { useToast } from "@/hooks/use-toast";

export default function Administration() {
  const { officer } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const leadership = isLeadership(officer?.rank);

  const { data: officers, isLoading, isError } = useGetOfficers({
    query: { enabled: leadership, queryKey: getGetOfficersQueryKey() },
  });
  const updateMutation = useUpdateOfficerPages();

  const [edits, setEdits] = useState<Record<number, string[]>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const pagesFor = (id: number, allowedPages: string[] | null | undefined) =>
    edits[id] ?? (allowedPages ?? ALL_PAGE_KEYS);

  const togglePage = (id: number, allowedPages: string[] | null | undefined, key: string) => {
    const current = pagesFor(id, allowedPages);
    const next = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key];
    setEdits(prev => ({ ...prev, [id]: next }));
  };

  const handleSave = async (id: number, allowedPages: string[] | null | undefined) => {
    setSavingId(id);
    try {
      await updateMutation.mutateAsync({ id, data: { allowedPages: pagesFor(id, allowedPages) } });
      toast({ title: "Gespeichert", description: "Seitenrechte wurden aktualisiert." });
      setEdits(prev => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      queryClient.invalidateQueries({ queryKey: getGetOfficersQueryKey() });
    } catch {
      toast({ title: "Fehler", description: "Seitenrechte konnten nicht gespeichert werden.", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  if (!leadership) {
    return (
      <div className="max-w-2xl">
        <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-6 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <p className="text-sm text-gray-300">
            Nur Leitungsränge dürfen die Administration verwalten.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-[#c9a227]" />
        <div>
          <h1 className="text-base font-semibold text-white">Administration</h1>
          <p className="text-xs text-gray-400">Seitenrechte der Officer verwalten. Leitungsränge sehen unabhängig davon immer alle Seiten.</p>
        </div>
      </div>

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded">
        {isLoading && <p className="text-sm text-gray-400 p-5">Lade Officer…</p>}
        {isError && <p className="text-sm text-red-400 p-5">Officer konnten nicht geladen werden.</p>}
        {!isLoading && !isError && (officers?.length ?? 0) === 0 && (
          <p className="text-sm text-gray-400 p-5">Keine Officer vorhanden.</p>
        )}
        {!isLoading && !isError && (officers?.length ?? 0) > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-[#1e2d4a]">
                <th className="px-4 py-3 font-medium">Dienstnummer</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Rang</th>
                <th className="px-4 py-3 font-medium">Seitenrechte</th>
                <th className="px-4 py-3 font-medium text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {officers!.map(o => {
                const dirty = edits[o.id] !== undefined;
                const saving = savingId === o.id;
                const oLeadership = isLeadership(o.rank);
                return (
                  <tr key={o.id} className="border-b border-[#1e2d4a]/50" data-testid={`row-admin-${o.id}`}>
                    <td className="px-4 py-3 text-gray-200">{o.dienstnummer}</td>
                    <td className="px-4 py-3 text-gray-200">{o.name}</td>
                    <td className="px-4 py-3">
                      <span className={oLeadership ? "text-[#c9a227]" : "text-gray-300"}>{o.rank}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5 max-w-md">
                        {PAGE_DEFS.map(p => (
                          <label
                            key={p.key}
                            className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={pagesFor(o.id, o.allowedPages).includes(p.key)}
                              onChange={() => togglePage(o.id, o.allowedPages, p.key)}
                              className="accent-[#c9a227] w-3.5 h-3.5"
                              data-testid={`checkbox-admin-${o.id}-${p.key}`}
                            />
                            {p.label}
                          </label>
                        ))}
                      </div>
                      {oLeadership && (
                        <p className="text-[10px] text-gray-500 mt-1">Leitung sieht immer alle Seiten.</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => handleSave(o.id, o.allowedPages)}
                          disabled={!dirty || saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#c9a227]/15 text-[#c9a227] hover:bg-[#c9a227]/25 transition-colors disabled:opacity-40"
                          data-testid={`button-save-pages-${o.id}`}
                        >
                          <Save className="w-3.5 h-3.5" />
                          {saving ? "Speichert…" : "Speichern"}
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
