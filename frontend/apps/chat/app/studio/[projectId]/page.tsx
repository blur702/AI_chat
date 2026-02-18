"use client";

import { useParams } from "next/navigation";
import { StudioEditor } from "../../../components/studio/studio-editor";

export default function StudioEditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  return <StudioEditor projectId={projectId} />;
}
