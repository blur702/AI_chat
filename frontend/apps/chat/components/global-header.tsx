"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  cn,
  Button,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  ThemeToggle,
  useBreakpoint,
} from "@workstation/ui";
import { useAuth } from "@workstation/api";
import {
  MessageSquare,
  Code2,
  Monitor,
  Globe,
  Settings,
  Palette,
  ImageIcon,
  Film,
  ShieldCheck,
  Server,
  LogOut,
  StickyNote,
  Bug,
} from "lucide-react";
import { useProjectId } from "@/app/hooks/use-project-id";
import { useNotes } from "@/components/notes/notes-provider";
import { useIssuesPanel } from "@/components/issues/issues-provider";
import { t } from "@/lib/i18n";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  matchPrefix?: boolean;
  requiresProject?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/chat", label: "Chat", icon: MessageSquare, matchPrefix: true },
  { href: "/projects", label: "Projects", icon: Code2 },
  { href: "/workspace", label: "Open IDE", icon: Monitor, requiresProject: true, matchPrefix: true },
  { href: "/drupal", label: "Drupal", icon: Globe, matchPrefix: true },
  { href: "/studio", label: "Studio", icon: Film, matchPrefix: true },
  { href: "/workspace/image-gen", label: "Images", icon: ImageIcon, requiresProject: true },
  { href: "/notes", label: "Notes", icon: StickyNote, matchPrefix: true },
  { href: "/palettes", label: "Palettes", icon: Palette },
  { href: "/mcp", label: "MCP", icon: Server },
  { href: "/settings", label: "Settings", icon: Settings, matchPrefix: true },
  { href: "/admin", label: "Admin", icon: ShieldCheck, matchPrefix: true },
];

export function GlobalHeader() {
  const { isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const projectId = useProjectId();
  const { isMobile } = useBreakpoint();
  const { toggleNotes } = useNotes();
  const { toggleIssues } = useIssuesPanel();

  // Don't show header on login page or when not authenticated
  if (!isAuthenticated || pathname === "/login") return null;

  const resolveHref = (item: NavItem) => {
    if (item.requiresProject && projectId) {
      if (item.href === "/workspace") return `/workspace/${projectId}`;
      if (item.href === "/workspace/image-gen") return `/workspace/${projectId}/image-gen`;
    }
    return item.href;
  };

  const isActive = (item: NavItem) => {
    if (item.matchPrefix) return pathname.startsWith(item.href);
    return pathname === item.href || pathname === resolveHref(item);
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-10 items-center px-3 gap-1">
        {/* Brand / Home */}
        <Link
          href="/"
          className="mr-2 flex items-center gap-1.5 text-sm font-semibold text-foreground shrink-0"
        >
          <MessageSquare className="h-4 w-4 text-primary" />
          {!isMobile && <span>SSDD</span>}
        </Link>

        {/* Nav links - scrollable on mobile */}
        <nav className="flex-1 min-w-0 overflow-x-auto" aria-label="Main navigation">
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-0.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const href = resolveHref(item);
                const active = isActive(item);
                const disabled = item.requiresProject && !projectId;

                if (disabled) return null;

                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={href}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                          "hover:bg-accent hover:text-accent-foreground",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {!isMobile && <span>{item.label}</span>}
                      </Link>
                    </TooltipTrigger>
                    {isMobile && (
                      <TooltipContent side="bottom">
                        <p>{item.label}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleNotes}
                aria-label="Notes (Ctrl+Shift+N)"
              >
                <StickyNote className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Notes (Ctrl+Shift+N)</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleIssues}
                aria-label="Issues (Ctrl+Shift+I)"
              >
                <Bug className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Issues (Ctrl+Shift+I)</p>
            </TooltipContent>
          </Tooltip>
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { logout(); window.location.href = "/login"; }}
                aria-label="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Log out</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
