import React from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Meldungen from "@/pages/meldungen";
import Streifen from "@/pages/streifen";
import Fallmanagement from "@/pages/fallmanagement";
import Beweismittel from "@/pages/beweismittel";
import Personal from "@/pages/personal";
import AuditLog from "@/pages/audit-log";
import Archiv from "@/pages/archiv";
import Einstellungen from "@/pages/einstellungen";
import AppLayout from "@/components/layout/AppLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;

  return (
    <AppLayout>
      <Component />
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
      <Route path="/" component={RootRedirect} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/leitstelle/meldungen" component={() => <ProtectedRoute component={Meldungen} />} />
      <Route path="/leitstelle/streifen" component={() => <ProtectedRoute component={Streifen} />} />
      <Route path="/fallmanagement" component={() => <ProtectedRoute component={Fallmanagement} />} />
      <Route path="/beweismittel" component={() => <ProtectedRoute component={Beweismittel} />} />
      <Route path="/personal" component={() => <ProtectedRoute component={Personal} />} />
      <Route path="/personal/id-change" component={() => <ProtectedRoute component={Personal} />} />
      <Route path="/personal/kalender" component={() => <ProtectedRoute component={Personal} />} />
      <Route path="/audit-log" component={() => <ProtectedRoute component={AuditLog} />} />
      <Route path="/archiv" component={() => <ProtectedRoute component={Archiv} />} />
      <Route path="/einstellungen" component={() => <ProtectedRoute component={Einstellungen} />} />
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
