"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, GraduationCap } from "lucide-react";
import { Button } from "@workstation/ui";

interface EducationalCardProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function EducationalCard({ title, children, defaultOpen = false }: EducationalCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 px-3 py-2 text-left text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100/50 dark:hover:bg-blue-900/30"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <GraduationCap className="h-4 w-4 shrink-0" />
        <span className="flex-1">{title}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </Button>
      {open && (
        <div className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}
