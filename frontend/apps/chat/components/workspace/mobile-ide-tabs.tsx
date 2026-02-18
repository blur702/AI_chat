"use client";

import { cn } from "@workstation/ui";
import {
  FolderOpen,
  Code2,
  Terminal,
  Eye,
  MessageSquare,
  ImageIcon,
  Wrench,
  HardDrive,
  Zap,
  Globe,
  BookOpen,
  Camera,
  Layers,
  LayoutTemplate,
  Map as MapIcon,
} from "lucide-react";

export type MobileIdeTab =
  | "files"
  | "editor"
  | "terminal"
  | "preview"
  | "chat"
  | "image-gen"
  | "tools"
  | "events"
  | "resources"
  | "drupal"
  | "kb"
  | "snapshots"
  | "context"
  | "ui-builder"
  | "planning"
  | "kb-builder";

const TABS: { id: MobileIdeTab; label: string; icon: typeof Code2 }[] = [
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "editor", label: "Code", icon: Code2 },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "image-gen", label: "Images", icon: ImageIcon },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "events", label: "Events", icon: Zap },
  { id: "resources", label: "GPU", icon: HardDrive },
  { id: "drupal", label: "Drupal", icon: Globe },
  { id: "kb", label: "KB", icon: BookOpen },
  { id: "snapshots", label: "Snaps", icon: Camera },
  { id: "context", label: "Context", icon: Layers },
  { id: "ui-builder", label: "Builder", icon: LayoutTemplate },
  { id: "planning", label: "Plans", icon: MapIcon },
];

interface MobileIdeTabsProps {
  activeTab: MobileIdeTab;
  onTabChange: (tab: MobileIdeTab) => void;
}

export function MobileIdeTabs({ activeTab, onTabChange }: MobileIdeTabsProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-background"
      style={{ minHeight: 56 }}
      role="tablist"
      aria-label="IDE panels"
    >
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeTab === id}
          onClick={() => onTabChange(id)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors min-h-[56px]",
            activeTab === id
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
