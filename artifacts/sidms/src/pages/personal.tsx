import React from "react";
import { useGetOfficers } from "@workspace/api-client-react";
import { Users } from "lucide-react";

function statusBadge(s: string) {
  const map: Record<string, string> = { "Anwesend": "bg-green-900/50 text-green-400", "In Einsatz": "bg-yellow-900/50 text-yellow-400", "Pause": "bg-blue-900/50 text-blue-400", "Abwesend": "bg-red-900/50 text-red-400" };
  return map[s] ?? "bg-gray-800 text-gray-400";
}
function radioBadge(s: string | undefined) {
  return s === "Aktiv" ? "bg-green-900/50 text-green-400" : "bg-gray-800 text-gray-500";
}

export default function Personal() {
  const { data: officers, isLoading } = useGetOfficers();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-[#c9a227]" />
        <div>
          <h1 className="text-base font-semibold text-white">Personal</h1>
          <p className="text-xs text-gray-400">Übersicht aller Beamten der Special Investigation Division.</p>
        </div>
      </div>
      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#0a0f1a] border-b border-[#1e2d4a]">
              {["Dienstnummer", "Name", "Rang", "Abteilung", "Status", "Funk", "Frequenz"].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-gray-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-500">Laden...</td></tr>
            ) : officers?.map(o => (
              <tr key={o.id} className="border-b border-[#1e2d4a]/40 hover:bg-[#1a2744]/30 transition-colors" data-testid={`officer-${o.id}`}>
                <td className="px-4 py-2.5 text-[#c9a227] font-mono">{o.dienstnummer}</td>
                <td className="px-4 py-2.5 text-white font-medium">{o.name}</td>
                <td className="px-4 py-2.5 text-gray-400">{o.rank}</td>
                <td className="px-4 py-2.5 text-gray-400">{o.division}</td>
                <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-xs ${statusBadge(o.status)}`}>{o.status}</span></td>
                <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-xs ${radioBadge(o.radioStatus)}`}>{o.radioStatus}</span></td>
                <td className="px-4 py-2.5 text-gray-500">{o.radioFreq}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
