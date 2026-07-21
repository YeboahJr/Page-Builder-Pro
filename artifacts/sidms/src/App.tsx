import React from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { hasFullAccess } from "@/lib/ranks";
import { pageAllowed } from "@/lib/pages";
import AccessDenied from "@/components/AccessDenied";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Registrierungen from "@/pages/registrierungen";
import Leitstelle from "@/pages/leitstelle";
import Fallmanagement from "@/pages/fallmanagement";
import Beweismittel from "@/pages/beweismittel";
import Personal from "@/pages/personal";
import IdChange from "@/pages/id-change";
import AuditLog from "@/pages/audit-log";
import Archiv from "@/pages/archiv";
import Einstellungen from "@/pages/einstellungen";
import ProfilBearbeiten from "@/pages/profil-bearbeiten";
import Administration from "@/pages/administration";
import AppLayout from "@/components/layout/AppLayout";
import BootSequence from "@/components/BootSequence";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

const BOOT_FLAG_KEY = "sidms_boot_played";

function ProtectedRoute({
  component: Component,
  pageKey,
}: {
  component: React.ComponentType;
  pageKey?: string;
}) {
  const { isAuthenticated, officer } = useAuth();
  const [, setLocation] = useLocation();
  const [bootCompleted, setBootCompleted] = React.useState(
    () => sessionStorage.getItem(BOOT_FLAG_KEY) === "true"
  );

  React.useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;

  if (!bootCompleted) {
    return <BootSequence onComplete={() => setBootCompleted(true)} />;
  }

  const fullAccess = hasFullAccess(officer?.role);
  const blocked = pageKey !== undefined && !fullAccess && !pageAllowed(officer?.allowedPages, pageKey);

  return (
    <AppLayout>
      {blocked ? <AccessDenied /> : <Component />}
    </AppLayout>
  );
}

function RootRedirect() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation(isAuthenticated ? "/dashboard" : "/login");
  }, [isAuthenticated, setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/" component={RootRedirect} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} pageKey="dashboard" />} />
      <Route path="/leitstelle" component={() => <ProtectedRoute component={Leitstelle} pageKey="leitstelle" />} />
      <Route path="/fallmanagement" component={() => <ProtectedRoute component={Fallmanagement} pageKey="fallmanagement" />} />
      <Route path="/beweismittel" component={() => <ProtectedRoute component={Beweismittel} pageKey="fallmanagement" />} />
      <Route path="/personal" component={() => <ProtectedRoute component={Personal} pageKey="personal" />} />
      <Route path="/personal/id-change" component={() => <ProtectedRoute component={IdChange} pageKey="personal" />} />
      <Route path="/personal/kalender" component={() => <ProtectedRoute component={Personal} pageKey="personal" />} />
      <Route path="/registrierungen" component={() => <ProtectedRoute component={Registrierungen} />} />
      <Route path="/administration" component={() => <ProtectedRoute component={Administration} />} />
      <Route path="/audit-log" component={() => <ProtectedRoute component={AuditLog} />} />
      <Route path="/archiv" component={() => <ProtectedRoute component={Archiv} pageKey="archiv" />} />
      <Route path="/einstellungen" component={() => <ProtectedRoute component={Einstellungen} />} />
      <Route path="/profil/bearbeiten" component={() => <ProtectedRoute component={ProfilBearbeiten} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
