import React from "react";
import { ShieldAlert } from "lucide-react";

export default function AccessDenied() {
  return (
    <div className="max-w-2xl">
      <div
        className="bg-[#0d1526] border border-[#1e2d4a] rounded p-6 flex items-center gap-3"
        data-testid="access-denied"
      >
        <ShieldAlert className="w-5 h-5 text-red-400" />
        <p className="text-sm text-gray-300">
          Zugriff verweigert. Sie sind für diese Seite nicht freigeschaltet.
        </p>
      </div>
    </div>
  );
}
