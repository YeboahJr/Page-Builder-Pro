import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Lock, User, IdCard, CheckCircle2, ArrowLeft } from "lucide-react";

export default function Register() {
  const { register, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [dienstnummer, setDienstnummer] = useState("");
  const [name, setName] = useState("");
  const [passwort, setPasswort] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  React.useEffect(() => {
    if (isAuthenticated) setLocation("/dashboard");
  }, [isAuthenticated, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const message = await register(dienstnummer.trim(), name.trim(), passwort);
      setSuccess(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registrierung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { border: "1.5px solid #c9a227" };
  const inputCls =
    "w-full bg-[#0a1020] text-white pl-10 pr-4 py-3.5 rounded-lg text-sm focus:outline-none placeholder:text-gray-600";

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#080d18] dark">
      <div
        className="w-full max-w-[480px] mx-4 rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #0d1830 0%, #0a1020 100%)",
          border: "1.5px solid #c9a227",
          boxShadow: "0 0 40px rgba(201,162,39,0.12), 0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div className="px-10 pt-10 pb-8">
          <div className="flex justify-center mb-4">
            <div className="w-40 h-40 flex items-center justify-center drop-shadow-[0_4px_24px_rgba(201,162,39,0.35)]">
              <img src="/fib-logo.png" alt="FIB Logo" className="w-full h-full object-contain" />
            </div>
          </div>

          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white mb-1">Registrierung</h1>
            <p className="text-[#c9a227] font-medium text-base">Special Investigation Division</p>
            <div className="flex items-center justify-center gap-3 my-3">
              <div className="h-px flex-1 bg-[#c9a227]/40" />
              <span className="text-[#c9a227] text-sm">★</span>
              <div className="h-px flex-1 bg-[#c9a227]/40" />
            </div>
            <p className="text-gray-400 text-sm">Zugang muss von der Leitung freigegeben werden</p>
          </div>

          {success ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center gap-3 py-4">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
                <p className="text-white text-sm" data-testid="text-register-success">{success}</p>
              </div>
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-lg text-white font-bold text-base tracking-widest uppercase transition-all"
                style={{
                  background: "linear-gradient(180deg, #1a4080 0%, #102060 100%)",
                  border: "1.5px solid #2a5bb0",
                  boxShadow: "0 4px 16px rgba(26,64,128,0.4)",
                }}
                data-testid="button-back-to-login"
              >
                <ArrowLeft className="w-4 h-4" />
                Zur Anmeldung
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-white text-sm font-medium block">Dienstnummer</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <IdCard className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={dienstnummer}
                    onChange={e => setDienstnummer(e.target.value)}
                    className={inputCls}
                    style={inputStyle}
                    placeholder="z. B. D-1011"
                    required
                    data-testid="input-register-dienstnummer"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-white text-sm font-medium block">Name</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <User className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className={inputCls}
                    style={inputStyle}
                    placeholder="Vor- und Nachname"
                    required
                    data-testid="input-register-name"
                  />
                </div>
              </div>

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
                    className={inputCls}
                    style={inputStyle}
                    placeholder="••••••••••••••••"
                    required
                    data-testid="input-register-passwort"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-xs text-center" data-testid="text-register-error">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-lg text-white font-bold text-base tracking-widest uppercase transition-all disabled:opacity-60 mt-2"
                style={{
                  background: "linear-gradient(180deg, #1a4080 0%, #102060 100%)",
                  border: "1.5px solid #2a5bb0",
                  boxShadow: "0 4px 16px rgba(26,64,128,0.4)",
                }}
                data-testid="button-register"
              >
                {loading ? "Wird gesendet..." : "Registrieren"}
              </button>

              <p className="text-center text-gray-400 text-sm pt-1">
                Bereits registriert?{" "}
                <button
                  type="button"
                  onClick={() => setLocation("/login")}
                  className="text-[#c9a227] font-medium hover:underline"
                  data-testid="link-login"
                >
                  Anmelden
                </button>
              </p>
            </form>
          )}
        </div>

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
