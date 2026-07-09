import { useGetCases } from "@workspace/api-client-react";
import { Scale } from "lucide-react";

function priorityBadge(p: string) {
  const map: Record<string, string> = { Hoch: "bg-red-900/60 text-red-400 border border-red-700/50", Mittel: "bg-orange-900/60 text-orange-400 border border-orange-700/50", Niedrig: "bg-green-900/60 text-green-400 border border-green-700/50" };
  return map[p] ?? "bg-gray-800 text-gray-400";
}

const STA_STATUS = "An STA übergeben";

export default function Staatsanwaltschaft() {
  const { data: cases, isLoading } = useGetCases();
  const staCases = (cases ?? []).filter(c => c.status === STA_STATUS);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded bg-[#0d1526] border border-purple-700/40 text-purple-400">
          <Scale className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-white">Staatsanwaltschaft</h1>
          <p className="text-xs text-gray-400">Alle Fälle, die an die Staatsanwaltschaft übergeben wurden.</p>
        </div>
      </div>

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#0a0f1a] border-b border-[#1e2d4a]">
              {["Fallnummer", "Titel", "Kategorie", "Priorität", "Leitender Agent", "Letzte Änderung"].map(h => (
                <th key={h} className="text-left px-3 py-2.5 text-gray-400 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Laden...</td></tr>
            ) : staCases.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500" data-testid="text-no-sta-cases">
                  Keine Fälle an die Staatsanwaltschaft übergeben.
                </td>
              </tr>
            ) : staCases.map(c => (
              <tr key={c.id} className="border-b border-[#1e2d4a]/40 hover:bg-[#1a2744]/30 transition-colors" data-testid={`sta-case-row-${c.id}`}>
                <td className="px-3 py-2.5 text-[#c9a227] font-mono whitespace-nowrap">{c.caseNumber}</td>
                <td className="px-3 py-2.5 text-white max-w-[220px] truncate">{c.title}</td>
                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{c.category}</td>
                <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityBadge(c.priority)}`}>{c.priority}</span></td>
                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{c.leadAgent}</td>
                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{c.lastModified}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
