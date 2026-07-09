import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useLogin, useRegister, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

interface OfficerData {
  id: number;
  dienstnummer: string;
  name: string;
  rank: string;
  division: string;
  status: string;
  radioStatus: string;
  radioFreq: string;
  avatarUrl: string | null;
  allowedPages?: string[] | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  officer: OfficerData | null;
  login: (dienstnummer: string, passwort: string) => Promise<void>;
  register: (dienstnummer: string, name: string, passwort: string) => Promise<string>;
  logout: () => void;
  updateOfficer: (data: Partial<OfficerData>) => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "sidms_officer";
const TOKEN_KEY = "sidms_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [officer, setOfficer] = useState<OfficerData | null>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = officer !== null;

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const meQuery = useGetMe({
    query: { enabled: isAuthenticated, queryKey: getGetMeQueryKey(), retry: false },
  });

  useEffect(() => {
    if (meQuery.data) {
      const fresh = meQuery.data as unknown as OfficerData;
      setOfficer((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...fresh };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, [meQuery.data]);

  const login = async (dienstnummer: string, passwort: string) => {
    setError(null);
    try {
      const result = await loginMutation.mutateAsync({ data: { dienstnummer, passwort } });
      const officerData = result.officer as OfficerData;
      setOfficer(officerData);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(officerData));
      if (result.token) {
        sessionStorage.setItem(TOKEN_KEY, result.token);
      }
      setLocation("/dashboard");
    } catch (err) {
      const e = err as { status?: number; data?: { error?: string } };
      if (e?.status === 403) {
        setError(e.data?.error ?? "Registrierung wartet noch auf Freigabe durch die Leitung.");
      } else {
        setError("Ungültige Anmeldedaten. Bitte überprüfen Sie Ihre Dienstnummer und Ihr Passwort.");
      }
    }
  };

  const register = async (dienstnummer: string, name: string, passwort: string): Promise<string> => {
    try {
      const result = await registerMutation.mutateAsync({ data: { dienstnummer, name, passwort } });
      return result.message;
    } catch (err) {
      const e = err as { data?: { error?: string } };
      throw new Error(e?.data?.error ?? "Registrierung fehlgeschlagen. Bitte versuche es erneut.");
    }
  };

  const updateOfficer = (data: Partial<OfficerData>) => {
    setOfficer((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...data };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const logout = async () => {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (token) {
        await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      }
    } catch {}
    setOfficer(null);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem("sidms_boot_played");
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, officer, login, register, logout, updateOfficer, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
