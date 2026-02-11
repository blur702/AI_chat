"use client";

import Link from "next/link";
import {
  Button,
  useBreakpoint,
  ThemeToggle,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  Badge,
} from "@workstation/ui";
import {
  Code2,
  FolderOpen,
  Play,
  Settings,
  MessageSquare,
  ListChecks,
  History,
  HardDrive,
  ImageIcon,
  Wrench,
  Star,
  ChevronDown,
  Zap,
} from "lucide-react";
import type { ToolInfo } from "@workstation/api/types";

interface SandboxToolbarProps {
  onFilesClick?: () => void;
  onRunClick?: () => void;
  onChatClick?: () => void;
  onActionsClick?: () => void;
  onHistoryClick?: () => void;
  onImageGenClick?: () => void;
  onResourcesClick?: () => void;
  onToolsClick?: () => void;
  onEventsClick?: () => void;
  onSettingsClick?: () => void;
  pendingActionsCount?: number;
  toolsCount?: number;
  pinnedTools?: ToolInfo[];
  onQuickExecuteTool?: (toolName: string) => void;
}

export function SandboxToolbar({
  onFilesClick,
  onRunClick,
  onChatClick,
  onActionsClick,
  onHistoryClick,
  onImageGenClick,
  onResourcesClick,
  onToolsClick,
  onEventsClick,
  onSettingsClick,
  pendingActionsCount = 0,
  toolsCount = 0,
  pinnedTools = [],
  onQuickExecuteTool,
}: SandboxToolbarProps) {
  const { isMobile } = useBreakpoint();

  return (
    <div className="flex items-center gap-1 md:gap-2 border-b bg-muted/30 px-2 md:px-3 py-1.5 overflow-x-auto">
      <Link href="/projects" className="flex items-center gap-2 mr-2 md:mr-4 shrink-0">
        <Code2 className="h-5 w-5 text-primary" />
        {!isMobile && (
          <span className="text-sm font-semibold">AI Sandbox</span>
        )}
      </Link>

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={onFilesClick}>
        <FolderOpen className="h-4 w-4" />
        {!isMobile && "Files"}
      </Button>

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={onRunClick}>
        <Play className="h-4 w-4" />
        {!isMobile && "Run"}
      </Button>

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0 relative" onClick={onActionsClick}>
        <ListChecks className="h-4 w-4" />
        {!isMobile && "Actions"}
        {pendingActionsCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
            {pendingActionsCount > 9 ? "9+" : pendingActionsCount}
          </span>
        )}
      </Button>

      {!isMobile && (
        <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={onHistoryClick}>
          <History className="h-4 w-4" />
          History
        </Button>
      )}

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={onImageGenClick} title="Image Gallery">
        <ImageIcon className="h-4 w-4" />
        {!isMobile && "Images"}
      </Button>

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={onResourcesClick} title="GPU Resources">
        <HardDrive className="h-4 w-4" />
        {!isMobile && "Resources"}
      </Button>

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={onEventsClick} title="Events">
        <Zap className="h-4 w-4" />
        {!isMobile && "Events"}
      </Button>

      {/* Tools dropdown with count badge */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 shrink-0 relative">
            <Wrench className="h-4 w-4" />
            {!isMobile && "Tools"}
            {toolsCount > 0 && (
              <Badge variant="secondary" className="h-4 text-[9px] px-1 ml-0.5">
                {toolsCount}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={onToolsClick}>
            <Wrench className="mr-2 h-3.5 w-3.5" />
            Quick Execute
            <span className="ml-auto text-[10px] text-muted-foreground">
              {isMobile ? "" : "Ctrl+T"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToolsClick}>
            <ListChecks className="mr-2 h-3.5 w-3.5" />
            All Tools
            <span className="ml-auto text-[10px] text-muted-foreground">
              {isMobile ? "" : "Ctrl+Shift+T"}
            </span>
          </DropdownMenuItem>
          {pinnedTools.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px]">Pinned Tools</DropdownMenuLabel>
              {pinnedTools.map((tool) => (
                <DropdownMenuItem
                  key={tool.name}
                  onClick={() => onQuickExecuteTool?.(tool.name)}
                >
                  <Star className="mr-2 h-3 w-3 text-yellow-500 fill-yellow-500" />
                  <span className="truncate">{tool.name}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={onChatClick}>
        <MessageSquare className="h-4 w-4" />
        {!isMobile && "AI Chat"}
      </Button>

      <ThemeToggle />

      <Button variant="ghost" size="icon" aria-label="Settings" onClick={onSettingsClick}>
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}
