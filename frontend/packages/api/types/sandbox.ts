export interface FileNode {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  modified_at?: string;
  children?: FileNode[];
}

export interface FileTreeResponse {
  files: FileNode[];
  total: number;
}

export interface FileContent {
  path: string;
  content: string;
  language: string;
}

export interface FileCreateRequest {
  path: string;
  content?: string;
}

export interface DirectoryCreateRequest {
  path: string;
}

export interface FileUpdateRequest {
  path: string;
  content: string;
}

export interface FileRenameRequest {
  old_path: string;
  new_path: string;
}
