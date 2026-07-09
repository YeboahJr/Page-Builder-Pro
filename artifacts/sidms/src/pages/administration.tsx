import React, { useState } from "react";
import { Shield, ShieldAlert, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOfficers,
  useUpdateOfficerPages,
  getGetOfficersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasFullAccess, ASSIGNABLE_ROLES } from "@/lib/ranks";
import { PAGE_DEFS, ALL_PAGE_KEYS } from "@/lib/pages";
import { useToast } from "@/hooks/use-toast";
import OfficerAvatar from "@/components/OfficerAvatar";

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export default function Administration() {
  const { officer } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fullAccess = hasFullAccess(officer?.role);

  const { data: officers, isLoading, isError } = useGetOfficers({
    query: { enabled: fullAccess, queryKey: getGetOfficersQueryKey() },
  });
  const updateMutation = useUpdateOfficerPages();

  const [edits, setEdits] = useState<Record<number, string[]>>({});
  const [roleEdits, setRoleEdits] = useState<Record<number, AssignableRole>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // null = keine Seiten zugewiesen — Checkboxen dann leer anzeigen.
  const pagesFor = (id: number, allowedPages: string[] | null | undefined) =>
    edits[id] ?? (allowedPages ?? []);

  const roleFor = (id: number, role: string | undefined) =>
    roleEdits[id] ?? (role ?? "Agent");

  const togglePage = (id: number, allowedPages: string[] | null | undefined, key: string) => {
    const current = pagesFor(id, allowedPages);
    const next = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key];
    setEdits(prev => ({ ...prev, [id]: next }));
  };

  const setRole = (id: number, role: AssignableRole) => {
    setRoleEdits(prev => ({ ...prev, [id]: role }));
  };

  const handleSave = async (
    id: number,
    allowedPages: string[] | null | undefined,
    currentRole: string | undefined,
  ) => {
    setSavingId(id);
    try {
      const roleEdit = roleEdits[id];
      await updateMutation.mutateAsync({
        id,
        data: {
          allowedPages: pagesFor(id, allowedPages),
          ...(roleEdit !== undefined && roleEdit !== currentRole ? { role: roleEdit } : {}),
        },
      });
      toast({ title: "Gespeichert", description: "Rechte wurden aktualisiert." });
      setEdits(prev => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      setRoleEdits(prev => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      queryClient.invalidateQueries({ queryKey: getGetOfficersQueryKey() });
    } catch {
      toast({ title: "Fehler", description: "Rechte konnten nicht gespeichert werden.", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  if (!fullAccess) {
    return (
      <div className="max-w-2xl">
        <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-6 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <p className="text-sm text-gray-300">
            Nur die Leitung darf die Administration verwalten.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-[#c9a227]" />
        <div>
          <h1 className="text-base font-semibold text-white">Administration</h1>
          <p className="text-xs text-gray-400">Rollen und Seitenrechte der Officer verwalten. Direktion und Leitung haben immer alle Rechte; Seitenrechte gelten nur für Agenten.</p>
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
                <th className="px-4 py-3 font-medium">Rolle</th>
                <th className="px-4 py-3 font-medium">Seitenrechte</th>
                <th className="px-4 py-3 font-medium text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {officers!.map(o => {
                const effectiveRole = roleFor(o.id, o.role);
                const isAdminUser = o.role === "Admin";
                const isSelf = o.id === officer?.id;
                const roleLocked = isAdminUser || isSelf;
                const oFullAccess = hasFullAccess(effectiveRole);
                const dirty = edits[o.id] !== undefined || (roleEdits[o.id] !== undefined && roleEdits[o.id] !== o.role);
                const saving = savingId === o.id;
                return (
                  <tr key={o.id} className="border-b border-[#1e2d4a]/50" data-testid={`row-admin-${o.id}`}>
                    <td className="px-4 py-3 text-gray-200">{o.dienstnummer}</td>
                    <td className="px-4 py-3 text-gray-200">
                      <span className="flex items-center gap-2">
                        <OfficerAvatar name={o.name} avatarUrl={o.avatarUrl} testId={`avatar-admin-${o.id}`} />
                        {o.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={oFullAccess ? "text-[#c9a227]" : "text-gray-300"}>{o.rank}</span>
                    </td>
                    <td className="px-4 py-3">
                      {roleLocked ? (
                        <span className="text-xs text-[#c9a227] font-medium" data-testid={`role-fixed-${o.id}`}>
                          {effectiveRole}
                        </span>
                      ) : (
                        <select
                          value={effectiveRole}
                          onChange={e => setRole(o.id, e.target.value as AssignableRole)}
                          className="bg-[#0a0f1a] border border-[#1e2d4a] rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-[#c9a227]"
                          data-testid={`select-role-${o.id}`}
                        >
                          {ASSIGNABLE_ROLES.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5 max-w-md">
                        {PAGE_DEFS.map(p => (
                          <label
                            key={p.key}
                            className={`flex items-center gap-1.5 text-xs select-none ${oFullAccess ? "text-gray-500 cursor-not-allowed" : "text-gray-300 cursor-pointer"}`}
                          >
                            <input
                              type="checkbox"
                              checked={oFullAccess || pagesFor(o.id, o.allowedPages).includes(p.key)}
                              disabled={oFullAccess}
                              onChange={() => togglePage(o.id, o.allowedPages, p.key)}
                              className="accent-[#c9a227] w-3.5 h-3.5"
                              data-testid={`checkbox-admin-${o.id}-${p.key}`}
                            />
                            {p.label}
                          </label>
                        ))}
                      </div>
                      {oFullAccess && (
                        <p className="text-[10px] text-gray-500 mt-1">Diese Rolle sieht immer alle Seiten.</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => handleSave(o.id, o.allowedPages, o.role)}
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
