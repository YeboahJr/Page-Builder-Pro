import { Scale } from "lucide-react";
import CaseOverview from "@/components/CaseOverview";

const STA_STATUS = "An STA übergeben";

export default function Staatsanwaltschaft() {
  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="p-2 rounded bg-[#0d1526] border border-purple-700/40 text-purple-400">
          <Scale className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-white">Staatsanwaltschaft</h1>
          <p className="text-xs text-gray-400">Alle Fälle, die an die Staatsanwaltschaft übergeben wurden.</p>
        </div>
      </div>

      <CaseOverview
        filterStatus={STA_STATUS}
        emptyText="Keine Fälle an die Staatsanwaltschaft übergeben."
        emptyTestId="text-no-sta-cases"
      />
    </div>
  );
}
