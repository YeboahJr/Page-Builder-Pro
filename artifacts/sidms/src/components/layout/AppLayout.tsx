import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Radio,
  Briefcase,
  Users,
  Archive,
  Settings,
  LogOut,
  Search,
  ChevronDown,
  ChevronRight,
  UserCog,
  UserPlus,
  Shield,
  Scale,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasFullAccess } from "@/lib/ranks";
import { pageAllowed } from "@/lib/pages";
import { initials } from "@/lib/initials";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  pageKey: string;
  children?: { label: string; href: string }[];
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", pageKey: "dashboard" },
  { icon: Radio, label: "Leitstelle", href: "/leitstelle", pageKey: "leitstelle" },
  { icon: Briefcase, label: "Fallmanagement", href: "/fallmanagement", pageKey: "fallmanagement" },
  { icon: Scale, label: "Staatsanwaltschaft", href: "/staatsanwaltschaft", pageKey: "staatsanwaltschaft" },
  {
    icon: Users,
    label: "Personal",
    href: "/personal",
    pageKey: "personal",
    children: [
      { label: "ID Change", href: "/personal/id-change" },
    ],
  },
  { icon: Archive, label: "Archiv", href: "/archiv", pageKey: "archiv" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { logout, officer } = useAuth();
  const leadership = hasFullAccess(officer?.role);
  const [expanded, setExpanded] = useState<string[]>(["/fallmanagement", "/personal"]);

  const toggleExpand = (href: string) => {
    setExpanded(prev =>
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]
    );
  };

  const isActive = (href: string) => location === href || location.startsWith(href + "/");

  const visibleNavItems = leadership
    ? navItems
    : navItems.filter((item) => pageAllowed(officer?.allowedPages, item.pageKey));

  return (
    <div className="min-h-screen bg-background text-foreground flex dark">
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 border-r border-primary/30 flex flex-col bg-[#0a0f1a]">
        {/* Logo */}
        <div className="px-4 py-4 flex flex-col items-center border-b border-primary/20">
          <div className="w-16 h-16 flex items-center justify-center mb-2 drop-shadow-[0_0_12px_rgba(201,162,39,0.3)]">
            <img src="/fib-logo.png" alt="FIB Logo" className="w-full h-full object-contain" />
          </div>
          <p className="font-bold tracking-widest text-sm text-white">SIDMS</p>
          <p className="text-xs text-muted-foreground">Version 1.0</p>
        </div>

        {/* Nav */}
        <div className="flex-1 py-4 overflow-y-auto">
          <nav className="px-2 space-y-0.5">
            {visibleNavItems.map((item) => {
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

            {leadership && (
              <Link
                href="/registrierungen"
                className={`flex items-center gap-2.5 px-3 py-2 rounded cursor-pointer transition-colors text-sm
                  ${isActive("/registrierungen")
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                data-testid="nav-registrierungen"
              >
                <UserPlus className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium">Registrierungen</span>
              </Link>
            )}

            {leadership && (
              <Link
                href="/administration"
                className={`flex items-center gap-2.5 px-3 py-2 rounded cursor-pointer transition-colors text-sm
                  ${isActive("/administration")
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                data-testid="nav-administration"
              >
                <Shield className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium">Administration</span>
              </Link>
            )}
          </nav>

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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="button-profile-menu"
                  className="flex items-center gap-2.5 border-l border-primary/20 pl-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm transition-colors data-[state=open]:[&_svg.chevron]:rotate-180"
                >
                  <Avatar className="w-8 h-8 border border-primary/50" data-testid="avatar-header">
                    {officer?.avatarUrl && <AvatarImage src={officer.avatarUrl} alt={officer.name} />}
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                      {officer?.name ? initials(officer.name) : <Users className="w-4 h-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-white leading-none">{officer?.name ?? "Agent"}</p>
                    <p className="text-xs text-primary leading-none mt-0.5">{officer?.rank ?? "Special Agent"}</p>
                  </div>
                  <ChevronDown className="chevron w-3.5 h-3.5 text-muted-foreground transition-transform" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 bg-[#0d1526] border-primary/20 text-white"
                data-testid="menu-profile"
              >
                <DropdownMenuLabel className="text-muted-foreground font-normal">
                  <span className="block text-xs font-semibold text-white">{officer?.name ?? "Agent"}</span>
                  <span className="block text-xs text-primary mt-0.5">{officer?.dienstnummer ?? "–"}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-primary/20" />
                <DropdownMenuItem
                  data-testid="menu-item-profil-bearbeiten"
                  className="text-gray-200 focus:bg-primary/10 focus:text-white cursor-pointer"
                  onSelect={() => setLocation("/profil/bearbeiten")}
                >
                  <UserCog className="text-primary" />
                  Profil bearbeiten
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="menu-item-einstellungen"
                  className="text-gray-200 focus:bg-primary/10 focus:text-white cursor-pointer"
                  onSelect={() => setLocation("/einstellungen")}
                >
                  <Settings className="text-primary" />
                  Einstellungen
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-primary/20" />
                <DropdownMenuItem
                  data-testid="menu-item-abmelden"
                  className="text-muted-foreground focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                  onSelect={() => logout()}
                >
                  <LogOut />
                  Abmelden
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5 bg-[#0d1117]">
          {children}
        </main>
      </div>
    </div>
  );
}
