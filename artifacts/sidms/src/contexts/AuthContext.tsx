import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useLogin, useLogout } from "@workspace/api-client-react";

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
}

interface AuthContextType {
  isAuthenticated: boolean;
  officer: OfficerData | null;
  login: (dienstnummer: string, passwort: string) => Promise<void>;
  logout: () => void;
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
    } catch {
      setError("Ungültige Anmeldedaten. Bitte überprüfen Sie Ihre Dienstnummer und Ihr Passwort.");
    }
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
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, officer, login, logout, error }}>
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
