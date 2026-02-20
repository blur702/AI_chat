"use client";

import { cn } from "@workstation/ui";
import {
  FolderTree,
  Puzzle,
  Palette,
  Paintbrush,
  Settings2,
  Terminal,
  Database,
  Eye,
} from "lucide-react";

export type DrupalDevTab =
  | "files"
  | "modules"
  | "themes"
  | "palette"
  | "config"
  | "drush"
  | "db"
  | "preview";

const TABS: { id: DrupalDevTab; icon: React.ElementType; label: string }[] = [
  { id: "files", icon: FolderTree, label: "Files" },
  { id: "modules", icon: Puzzle, label: "Modules" },
  { id: "themes", icon: Palette, label: "Themes" },
  { id: "palette", icon: Paintbrush, label: "Color Palette" },
  { id: "config", icon: Settings2, label: "Config" },
  { id: "drush", icon: Terminal, label: "Drush" },
  { id: "db", icon: Database, label: "Database" },
  { id: "preview", icon: Eye, label: "Preview" },
];

interface Props {
  active: DrupalDevTab;
  onChange: (tab: DrupalDevTab) => void;
}

export function DrupalDevSidebar({ active, onChange }: Props) {
  return (
    <nav
      className="flex flex-col w-12 border-r bg-muted/30 py-2 gap-1 shrink-0"
      role="tablist"
      aria-label="Drupal IDE navigation"
      aria-orientation="vertical"
    >
      {TABS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          aria-controls={`drupal-panel-${id}`}
          onClick={() => onChange(id)}
          title={label}
          className={cn(
            "flex items-center justify-center w-10 h-10 mx-auto rounded-md transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            active === id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </nav>
  );
}
