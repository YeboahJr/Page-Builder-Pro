import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Lock, User } from "lucide-react";

export default function Login() {
  const { login, isAuthenticated, error } = useAuth();
  const [, setLocation] = useLocation();
  const [dienstnummer, setDienstnummer] = useState("");
  const [passwort, setPasswort] = useState("");
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (isAuthenticated) setLocation("/dashboard");
  }, [isAuthenticated, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await login(dienstnummer, passwort);
    setLoading(false);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0a0e1a] dark">
      <div className="w-full max-w-sm px-6">
        {/* Badge */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-36 h-36 flex items-center justify-center mb-5 drop-shadow-[0_0_24px_rgba(201,162,39,0.25)]">
            <img src="/fib-logo.png" alt="FIB Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-bold tracking-wider text-white uppercase">Federal Investigation Bureau</h1>
          <p className="text-sm text-[#c9a227] tracking-widest uppercase mt-1">Special Investigation Division</p>
          <div className="flex items-center gap-2 mt-3">
            <div className="h-px w-12 bg-[#c9a227]/40" />
            <span className="text-[#c9a227] text-sm">★</span>
            <div className="h-px w-12 bg-[#c9a227]/40" />
          </div>
          <p className="text-sm text-gray-400 mt-2">SIDMS – Version 1.0</p>
        </div>

        {/* Form card */}
        <div className="bg-[#0d1526] border border-[#c9a227]/30 rounded-lg p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-200">Dienstnummer</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={dienstnummer}
                  onChange={e => setDienstnummer(e.target.value)}
                  className="w-full bg-[#0a0f1c] border border-[#1e2d4a] text-white rounded pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#c9a227]/60 focus:ring-1 focus:ring-[#c9a227]/40 placeholder:text-gray-600"
                  placeholder="Z.B. D-1001"
                  required
                  data-testid="input-dienstnummer"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-200">Passwort</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="password"
                  value={passwort}
                  onChange={e => setPasswort(e.target.value)}
                  className="w-full bg-[#0a0f1c] border border-[#1e2d4a] text-white rounded pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#c9a227]/60 focus:ring-1 focus:ring-[#c9a227]/40 placeholder:text-gray-600"
                  placeholder="••••••••••••••••"
                  required
                  data-testid="input-passwort"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1a3d7c] hover:bg-[#1e4a94] border border-[#2a5bb0] text-white font-bold py-3 rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-60 text-sm tracking-widest uppercase"
              data-testid="button-login"
            >
              <Lock className="w-4 h-4" />
              {loading ? "Anmelden..." : "Anmelden"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          SIDMS © 2026 | FIB Special Investigation Division
        </p>
      </div>
    </div>
  );
}
