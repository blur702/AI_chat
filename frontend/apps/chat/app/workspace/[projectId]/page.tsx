"use client";

import { useParams } from "next/navigation";
import { IDELayout } from "@/components/workspace/ide-layout";

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <IDELayout projectId={projectId} />;
}
