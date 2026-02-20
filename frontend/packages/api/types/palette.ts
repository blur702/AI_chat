export interface SavedPaletteColor {
  hex: string;
  name?: string;
  role?: string;
}

export interface SavedPaletteCreateRequest {
  name: string;
  description?: string;
  colors: SavedPaletteColor[];
  tags?: string[];
}

export interface SavedPaletteUpdateRequest {
  name?: string;
  description?: string;
  colors?: SavedPaletteColor[];
  tags?: string[];
}

export interface SavedPaletteResponse {
  id: string;
  name: string;
  description?: string;
  colors: SavedPaletteColor[];
  tags: string[];
  created_at?: string;
  updated_at?: string;
}

export interface SavedPaletteListResponse {
  palettes: SavedPaletteResponse[];
  count: number;
}
