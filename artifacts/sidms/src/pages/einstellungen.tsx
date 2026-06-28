import React from "react";
import { Settings, Shield, Radio, Database } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function Einstellungen() {
  const { officer } = useAuth();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Settings className="w-5 h-5 text-[#c9a227]" />
        <div>
          <h1 className="text-base font-semibold text-white">Einstellungen</h1>
          <p className="text-xs text-gray-400">Systemeinstellungen und Benutzerprofil.</p>
        </div>
      </div>

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Shield className="w-4 h-4 text-[#c9a227]" /> Profil</h2>
        <div className="space-y-3">
          {[
            ["Dienstnummer", officer?.dienstnummer ?? "–"],
            ["Name", officer?.name ?? "–"],
            ["Rang", officer?.rank ?? "–"],
            ["Abteilung", officer?.division ?? "–"],
            ["Status", officer?.status ?? "–"],
          ].map(([label, val]) => (
            <div key={label} className="flex items-center text-sm">
              <span className="text-gray-400 w-40">{label}</span>
              <span className="text-gray-200">{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Radio className="w-4 h-4 text-[#c9a227]" /> Funkeinstellungen</h2>
        <div className="space-y-3">
          {[
            ["Frequenz", officer?.radioFreq ?? "–"],
            ["Funk-Status", officer?.radioStatus ?? "–"],
          ].map(([label, val]) => (
            <div key={label} className="flex items-center text-sm">
              <span className="text-gray-400 w-40">{label}</span>
              <span className="text-gray-200">{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Database className="w-4 h-4 text-[#c9a227]" /> System</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center">
            <span className="text-gray-400 w-40">SIDMS Version</span>
            <span className="text-gray-200">1.0.0</span>
          </div>
          <div className="flex items-center">
            <span className="text-gray-400 w-40">API Status</span>
            <span className="text-green-400">Online</span>
          </div>
          <div className="flex items-center">
            <span className="text-gray-400 w-40">Datenbank</span>
            <span className="text-green-400">Verbunden</span>
          </div>
        </div>
      </div>
    </div>
  );
}
