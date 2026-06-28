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
    <div className="min-h-screen w-full flex items-center justify-center bg-[#080d18] dark">
      {/* Outer card with gold border */}
      <div
        className="w-full max-w-[480px] mx-4 rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #0d1830 0%, #0a1020 100%)",
          border: "1.5px solid #c9a227",
          boxShadow: "0 0 40px rgba(201,162,39,0.12), 0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Top content area */}
        <div className="px-10 pt-10 pb-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-64 h-64 flex items-center justify-center drop-shadow-[0_4px_24px_rgba(201,162,39,0.35)]">
              <img src="/fib-logo.png" alt="FIB Logo" className="w-full h-full object-contain" />
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white mb-1">Federal Investigation Bureau</h1>
            <p className="text-[#c9a227] font-medium text-base">Special Investigation Division</p>
            <div className="flex items-center justify-center gap-3 my-3">
              <div className="h-px flex-1 bg-[#c9a227]/40" />
              <span className="text-[#c9a227] text-sm">★</span>
              <div className="h-px flex-1 bg-[#c9a227]/40" />
            </div>
            <p className="text-gray-400 text-sm">SIDMS - Version 1.0</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Dienstnummer */}
            <div className="space-y-1.5">
              <label className="text-white text-sm font-medium block">Dienstnummer</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <User className="w-4 h-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={dienstnummer}
                  onChange={e => setDienstnummer(e.target.value)}
                  className="w-full bg-[#0a1020] text-white pl-10 pr-4 py-3.5 rounded-lg text-sm focus:outline-none placeholder:text-gray-600"
                  style={{ border: "1.5px solid #c9a227" }}
                  required
                  data-testid="input-dienstnummer"
                />
              </div>
            </div>

            {/* Passwort */}
            <div className="space-y-1.5">
              <label className="text-white text-sm font-medium block">Passwort</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <Lock className="w-4 h-4 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={passwort}
                  onChange={e => setPasswort(e.target.value)}
                  className="w-full bg-[#0a1020] text-white pl-10 pr-4 py-3.5 rounded-lg text-sm focus:outline-none placeholder:text-gray-600"
                  style={{ border: "1.5px solid #c9a227" }}
                  placeholder="••••••••••••••••"
                  required
                  data-testid="input-passwort"
                />
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-lg text-white font-bold text-base tracking-widest uppercase transition-all disabled:opacity-60 mt-2"
              style={{
                background: "linear-gradient(180deg, #1a4080 0%, #102060 100%)",
                border: "1.5px solid #2a5bb0",
                boxShadow: "0 4px 16px rgba(26,64,128,0.4)",
              }}
              data-testid="button-login"
            >
              <Lock className="w-4 h-4" />
              {loading ? "Anmelden..." : "Anmelden"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div
          className="px-8 py-4 text-center text-gray-500 text-xs"
          style={{ borderTop: "1px solid rgba(201,162,39,0.25)" }}
        >
          SIDMS © 2026 &nbsp;|&nbsp; FIB Special Investigation Division
        </div>
      </div>
    </div>
  );
}
