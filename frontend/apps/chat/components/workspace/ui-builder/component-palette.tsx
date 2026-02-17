"use client";

import { useState } from "react";
import { Badge, Input, Skeleton } from "@workstation/ui";
import {
  SquareStack,
  Type,
  LayoutGrid,
  Image,
  Navigation,
  FormInput,
  GripVertical,
  Search,
} from "lucide-react";
import type { UIComponentInfo } from "@workstation/api/types";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  basic: <Type className="h-3.5 w-3.5" />,
  layout: <LayoutGrid className="h-3.5 w-3.5" />,
  media: <Image className="h-3.5 w-3.5" />,
  navigation: <Navigation className="h-3.5 w-3.5" />,
  form: <FormInput className="h-3.5 w-3.5" />,
};

interface ComponentPaletteProps {
  components: UIComponentInfo[];
  categories: string[];
  loading: boolean;
  onDragStart: (component: UIComponentInfo) => void;
  onAdd: (component: UIComponentInfo) => void;
}

export function ComponentPalette({
  components,
  categories,
  loading,
  onDragStart,
  onAdd,
}: ComponentPaletteProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredComponents = components.filter((c) => {
    const matchesSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = !activeCategory || c.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="space-y-2 p-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components..."
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 p-2 border-b">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
            activeCategory === null
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <SquareStack className="h-3 w-3" />
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
              activeCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {CATEGORY_ICONS[cat] || <SquareStack className="h-3 w-3" />}
            {cat}
          </button>
        ))}
      </div>

      {/* Component list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredComponents.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No components found.
          </p>
        )}
        {filteredComponents.map((comp) => (
          <button
            key={comp.id}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/ui-component", JSON.stringify(comp));
              onDragStart(comp);
            }}
            onClick={() => onAdd(comp)}
            className="flex w-full items-center gap-2 rounded-md border p-2 text-left transition-colors hover:bg-accent hover:border-primary/30 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium truncate">{comp.name}</span>
                <Badge variant="outline" className="text-[8px] capitalize shrink-0">
                  {comp.category}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">
                {comp.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
