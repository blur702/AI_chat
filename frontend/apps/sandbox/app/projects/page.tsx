"use client";

import Link from "next/link";
import { Button, Badge } from "@workstation/ui";
import { FolderOpen, Plus } from "lucide-react";

const MOCK_PROJECTS = [
  { id: "proj-1", name: "My FastAPI App", type: "python", path: "/workspace/fastapi-app" },
  { id: "proj-2", name: "React Dashboard", type: "typescript", path: "/workspace/react-dashboard" },
  { id: "proj-3", name: "Data Pipeline", type: "python", path: "/workspace/data-pipeline" },
];

export default function ProjectsPage() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Projects</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="grid gap-4">
        {MOCK_PROJECTS.map((project) => (
          <Link key={project.id} href={`/workspace/${project.id}`}>
            <div className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
              <div className="flex-1">
                <h3 className="font-medium">{project.name}</h3>
                <p className="text-sm text-muted-foreground">{project.path}</p>
              </div>
              <Badge variant="secondary">{project.type}</Badge>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
