// Types for the Drupal local development API

export interface DrupalLocalFileNode {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  children?: DrupalLocalFileNode[];
}

export interface DrupalLocalFileTreeResponse {
  files: DrupalLocalFileNode[];
  total: number;
}

export interface DrupalLocalFileContent {
  path: string;
  content: string;
  language: string;
}

export interface DrupalLocalFileCreateRequest {
  path: string;
  content?: string;
}

export interface DrupalLocalFileUpdateRequest {
  path: string;
  content: string;
}

export interface DrupalLocalFileRenameRequest {
  old_path: string;
  new_path: string;
}

export interface DrupalLocalDrushRequest {
  command: string;
}

export interface DrupalLocalDrushResponse {
  command: string;
  exit_code: number;
  stdout: string;
  stderr: string;
}

export interface DrupalLocalModuleInfo {
  machine_name: string;
  name: string;
  path: string;
  status?: string;
  description?: string;
}

export interface DrupalLocalThemeInfo {
  machine_name: string;
  name: string;
  path: string;
  status?: string;
}

export interface DrupalLocalModuleScaffoldRequest {
  machine_name: string;
  name: string;
  description?: string;
  package?: string;
}

export interface DrupalLocalModuleScaffoldResponse {
  machine_name: string;
  path: string;
  files_created: string[];
}

export interface DrupalLocalSiteStatus {
  drupal_version?: string;
  php_version?: string;
  db_driver?: string;
  site_uri?: string;
  raw: string;
}

export interface DrupalLocalConfigStatus {
  items: Array<{ name: string; state: string }>;
  raw: string;
}

export interface DrupalLocalDrushResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

// Color Palette / WCAG AA

export interface ContrastPair {
  fg: string;
  bg: string;
  ratio: number;
  aa_normal: boolean;
  aa_large: boolean;
  aaa_normal: boolean;
}

export interface PaletteColor {
  hex: string;
  name: string;
  role: string;
}

export interface PaletteResponse {
  colors: PaletteColor[];
  contrast_matrix: ContrastPair[];
  all_aa_pass: boolean;
  css_variables: string;
  scss_variables: string;
}

export interface PaletteGenerateRequest {
  description?: string;
  seed_color?: string;
  harmony?: "complementary" | "triadic" | "analogous" | "split-complementary" | "tetradic";
  count?: number;
  model?: string;
}

export interface PaletteValidateRequest {
  colors: string[];
}
