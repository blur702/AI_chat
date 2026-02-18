"use client";

import { memo } from "react";
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
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
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
  Globe,
  BookOpen,
  Camera,
  Power,
  Layers,
  HelpCircle,
  LayoutTemplate,
  Map as MapIcon,
  GraduationCap,
  Bug,
} from "lucide-react";
import type { ToolInfo } from "@workstation/api/types";
import { useHelp } from "../help/help-provider";
import { t } from "@/lib/i18n";

interface WorkspaceToolbarProps {
  onFilesClick?: () => void;
  onRunClick?: () => void;
  onChatClick?: () => void;
  onActionsClick?: () => void;
  onHistoryClick?: () => void;
  onImageGenClick?: () => void;
  onResourcesClick?: () => void;
  onToolsClick?: () => void;
  onEventsClick?: () => void;
  onDrupalClick?: () => void;
  onKBClick?: () => void;
  onSnapshotsClick?: () => void;
  onContextClick?: () => void;
  onUIBuilderClick?: () => void;
  onPlanningClick?: () => void;
  onKBBuilderClick?: () => void;
  onIssuesClick?: () => void;
  onCloseProject?: () => void;
  onSettingsClick?: () => void;
  pendingActionsCount?: number;
  toolsCount?: number;
  pinnedTools?: ToolInfo[];
  onQuickExecuteTool?: (toolName: string) => void;
}

export const WorkspaceToolbar = memo(function WorkspaceToolbar({
  onFilesClick,
  onRunClick,
  onChatClick,
  onActionsClick,
  onHistoryClick,
  onImageGenClick,
  onResourcesClick,
  onToolsClick,
  onEventsClick,
  onDrupalClick,
  onKBClick,
  onSnapshotsClick,
  onContextClick,
  onUIBuilderClick,
  onPlanningClick,
  onKBBuilderClick,
  onIssuesClick,
  onCloseProject,
  onSettingsClick,
  pendingActionsCount = 0,
  toolsCount = 0,
  pinnedTools = [],
  onQuickExecuteTool,
}: WorkspaceToolbarProps) {
  const { isMobile } = useBreakpoint();
  const { openHelp } = useHelp();

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex items-center gap-1 overflow-x-auto border-b bg-muted/30 px-2 py-1.5 md:gap-2 md:px-3">
        <Link href="/chat" className="mr-2 flex shrink-0 items-center gap-2 md:mr-4">
          <Code2 className="h-5 w-5 text-primary" />
          {!isMobile && <span className="text-sm font-semibold">AI Workstation</span>}
        </Link>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={onFilesClick}>
              <FolderOpen className="h-4 w-4" />
              {!isMobile && t("files")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Browse and edit project files</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-files");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={onRunClick}>
              <Play className="h-4 w-4" />
              {!isMobile && t("run")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Run commands in the sandbox terminal</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-run");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="relative shrink-0 gap-1.5"
              onClick={onActionsClick}
            >
              <ListChecks className="h-4 w-4" />
              {!isMobile && t("actions")}
              {pendingActionsCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {pendingActionsCount > 9 ? "9+" : pendingActionsCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Review and execute pending automation actions</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-actions");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        {!isMobile && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={onHistoryClick}
              >
                <History className="h-4 w-4" />
                {t("history")}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>View event and action history</p>
              <button
                type="button"
                className="mt-1 block text-xs text-primary hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openHelp("workspace-history");
                }}
              >
                Learn more
              </button>
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={onImageGenClick}
            >
              <ImageIcon className="h-4 w-4" />
              {!isMobile && t("images")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Generate and browse AI images</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-images");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={onResourcesClick}
            >
              <HardDrive className="h-4 w-4" />
              {!isMobile && t("resources")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Monitor GPU VRAM and loaded models</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-resources");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={onEventsClick}>
              <Zap className="h-4 w-4" />
              {!isMobile && t("events")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>View system events and notifications</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-events");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={onDrupalClick}>
              <Globe className="h-4 w-4" />
              {!isMobile && t("drupal")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Manage connected Drupal sites</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-drupal");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={onKBClick}>
              <BookOpen className="h-4 w-4" />
              {!isMobile && t("kb")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Upload documents and search the knowledge base</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-kb");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={onSnapshotsClick}
            >
              <Camera className="h-4 w-4" />
              {!isMobile && t("snapshots")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Save and restore workspace snapshots</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-snapshots");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={onContextClick}>
              <Layers className="h-4 w-4" />
              {!isMobile && t("context")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Edit context layers sent to the AI</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-context");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={onUIBuilderClick}
            >
              <LayoutTemplate className="h-4 w-4" />
              {!isMobile && t("uiBuilder")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Drag-and-drop UI component builder</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-ui-builder");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={onPlanningClick}
            >
              <MapIcon className="h-4 w-4" />
              {!isMobile && t("plans")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Plan, execute, verify and ship with structured workflows</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-planning");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={onKBBuilderClick}
            >
              <GraduationCap className="h-4 w-4" />
              {!isMobile && t("kbBuilder")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Build a vector knowledge base step-by-step with educational wizard</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("kb-what-are-embeddings");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={onIssuesClick}>
              <Bug className="h-4 w-4" />
              {!isMobile && "Issues"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Track and fix project issues</p>
          </TooltipContent>
        </Tooltip>

        {/* Tools dropdown with count badge */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative shrink-0 gap-1">
                  <Wrench className="h-4 w-4" />
                  {!isMobile && t("tools")}
                  {toolsCount > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[9px]">
                      {toolsCount}
                    </Badge>
                  )}
                  <ChevronDown className="ml-0.5 h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Registered tools and quick execution</p>
              <button
                type="button"
                className="mt-1 block text-xs text-primary hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openHelp("workspace-tools");
                }}
              >
                Learn more
              </button>
            </TooltipContent>
          </Tooltip>
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
                  <DropdownMenuItem key={tool.name} onClick={() => onQuickExecuteTool?.(tool.name)}>
                    <Star className="mr-2 h-3 w-3 fill-yellow-500 text-yellow-500" />
                    <span className="truncate">{tool.name}</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={onChatClick}>
              <MessageSquare className="h-4 w-4" />
              {!isMobile && t("aiChat")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Open the AI chat panel</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-chat");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Help" onClick={() => openHelp()}>
              <HelpCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Browse help topics and search for answers</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-help");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>

        <ThemeToggle />

        {onCloseProject && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close Project"
                onClick={onCloseProject}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Power className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Close this project and return to chat</p>
              <button
                type="button"
                className="mt-1 block text-xs text-primary hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openHelp("workspace-close");
                }}
              >
                Learn more
              </button>
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Settings" onClick={onSettingsClick}>
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Workspace settings and preferences</p>
            <button
              type="button"
              className="mt-1 block text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openHelp("workspace-settings");
              }}
            >
              Learn more
            </button>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
});
