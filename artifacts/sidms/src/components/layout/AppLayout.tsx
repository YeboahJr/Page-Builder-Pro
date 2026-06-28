import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Shield,
  LayoutDashboard,
  Radio,
  Briefcase,
  Users,
  History,
  Archive,
  Settings,
  LogOut,
  Search,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Car,
  Package,
  CreditCard,
  Calendar,
  Plus,
  FileWarning,
  FileText,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  children?: { label: string; href: string }[];
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  {
    icon: Radio,
    label: "Leitstelle",
    href: "/leitstelle",
    children: [
      { label: "Meldung", href: "/leitstelle/meldungen" },
      { label: "Streifen", href: "/leitstelle/streifen" },
    ],
  },
  {
    icon: Briefcase,
    label: "Fallmanagement",
    href: "/fallmanagement",
    children: [
      { label: "Beweismittel", href: "/beweismittel" },
    ],
  },
  {
    icon: Users,
    label: "Personal",
    href: "/personal",
    children: [
      { label: "ID Change", href: "/personal/id-change" },
      { label: "Kalender", href: "/personal/kalender" },
    ],
  },
  { icon: History, label: "Audit-Log", href: "/audit-log" },
  { icon: Archive, label: "Archiv", href: "/archiv" },
  { icon: Settings, label: "Einstellungen", href: "/einstellungen" },
];

const quickLinks = [
  { icon: Plus, label: "Neuer Fall", href: "/fallmanagement?new=1" },
  { icon: FileWarning, label: "Neue Meldung", href: "/leitstelle/meldungen?new=1" },
  { icon: Car, label: "Neuer Streifen", href: "/leitstelle/streifen" },
  { icon: Package, label: "Neues Beweismittel", href: "/beweismittel?new=1" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout, officer } = useAuth();
  const [expanded, setExpanded] = useState<string[]>(["/leitstelle", "/fallmanagement", "/personal"]);

  const toggleExpand = (href: string) => {
    setExpanded(prev =>
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]
    );
  };

  const isActive = (href: string) => location === href || location.startsWith(href + "/");

  return (
    <div className="min-h-screen bg-background text-foreground flex dark">
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 border-r border-primary/30 flex flex-col bg-[#0a0f1a]">
        {/* Logo */}
        <div className="px-4 py-5 flex flex-col items-center border-b border-primary/20">
          <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center mb-2">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <p className="font-bold tracking-widest text-sm text-white">SIDMS</p>
          <p className="text-xs text-muted-foreground">Version 1.0</p>
        </div>

        {/* Nav */}
        <div className="flex-1 py-4 overflow-y-auto">
          <nav className="px-2 space-y-0.5">
            {navItems.map((item) => {
              const active = isActive(item.href);
              const isExpanded = expanded.includes(item.href);
              const hasChildren = item.children && item.children.length > 0;

              return (
                <div key={item.href}>
                  <div
                    className={`flex items-center gap-2.5 px-3 py-2 rounded cursor-pointer transition-colors text-sm
                      ${active && !hasChildren
                        ? "bg-primary/10 text-primary border-l-2 border-primary"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      }`}
                    onClick={() => {
                      if (hasChildren) {
                        toggleExpand(item.href);
                      }
                    }}
                  >
                    {hasChildren ? (
                      <>
                        <Link href={item.href} className="flex items-center gap-2.5 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                          <item.icon className="w-4 h-4 flex-shrink-0" />
                          <span className="font-medium">{item.label}</span>
                        </Link>
                        <button onClick={() => toggleExpand(item.href)} className="p-0.5 hover:text-foreground flex-shrink-0">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    ) : (
                      <Link href={item.href} className="flex items-center gap-2.5 w-full">
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    )}
                  </div>

                  {hasChildren && isExpanded && (
                    <div className="ml-6 mt-0.5 space-y-0.5 border-l border-primary/20 pl-3">
                      {item.children!.map(child => {
                        const childActive = location === child.href || location.startsWith(child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block px-2 py-1.5 rounded text-xs transition-colors
                              ${childActive
                                ? "text-primary font-semibold"
                                : "text-muted-foreground hover:text-foreground"
                              }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Schnellzugriff */}
          <div className="mt-6 px-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-2">Schnellzugriff</p>
            {quickLinks.map(q => (
              <Link
                key={q.href}
                href={q.href}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <q.icon className="w-3.5 h-3.5" />
                {q.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Logout */}
        <div className="p-3 border-t border-primary/20">
          <button
            onClick={logout}
            data-testid="button-logout"
            className="flex items-center gap-2.5 px-3 py-2 rounded w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span className="font-medium">Abmelden</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 flex-shrink-0 border-b border-primary/20 flex items-center justify-between px-6 bg-[#0a0f1a]/80">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold tracking-widest text-white">FEDERAL INVESTIGATION BUREAU</span>
            <span className="text-primary text-xs tracking-widest">SPECIAL INVESTIGATION DIVISION</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-xs bg-[#0d1526] border-primary/20 focus-visible:ring-primary/40"
                placeholder="Suche..."
                data-testid="input-global-search"
              />
            </div>

            <div className="flex items-center gap-2.5 border-l border-primary/20 pl-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white leading-none">{officer?.name ?? "Agent"}</p>
                <p className="text-xs text-primary leading-none mt-0.5">{officer?.rank ?? "Special Agent"}</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5 bg-[#0d1117]">
          {children}
        </main>
      </div>
    </div>
  );
}
