"use client";

import { useState, useMemo } from "react";
import { useHelpAdmin } from "@workstation/api/hooks";
import type { HelpTopic, HelpTopicCreateRequest, HelpTopicUpdateRequest } from "@workstation/api/types/help";
import {
  Button,
  Input,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  ScrollArea,
  cn,
} from "@workstation/ui";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  BookOpen,
  AlertCircle,
  Loader2,
  RefreshCw,
  X,
  Tag,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// -------------------------------------------------------------------
// Section filter dropdown
// -------------------------------------------------------------------

function SectionFilter({
  sections,
  selected,
  onSelect,
}: {
  sections: string[];
  selected: string | null;
  onSelect: (s: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
          selected === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:text-foreground"
        )}
      >
        All ({sections.length})
      </button>
      {sections.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s === selected ? null : s)}
          className={cn(
            "px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize",
            s === selected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {s.replace(/-/g, " ")}
        </button>
      ))}
    </div>
  );
}

// -------------------------------------------------------------------
// Topic form (create / edit)
// -------------------------------------------------------------------

interface TopicFormData {
  slug: string;
  section_id: string;
  title: string;
  body: string;
  tags: string;
}

function emptyForm(): TopicFormData {
  return { slug: "", section_id: "", title: "", body: "", tags: "" };
}

function topicToForm(t: HelpTopic): TopicFormData {
  return {
    slug: t.slug,
    section_id: t.section_id,
    title: t.title,
    body: t.body,
    tags: t.tags.join(", "),
  };
}

function TopicFormDialog({
  open,
  onOpenChange,
  initial,
  existingSections,
  saving,
  onSave,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TopicFormData;
  existingSections: string[];
  saving: boolean;
  onSave: (data: TopicFormData) => void;
  mode: "create" | "edit";
}) {
  const [form, setForm] = useState<TopicFormData>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof TopicFormData, string>>>({});

  // Reset form when dialog opens with new initial data
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(initial);
      setErrors({});
    }
  }

  const validate = (): boolean => {
    const errs: Partial<Record<keyof TopicFormData, string>> = {};
    if (!form.slug.trim()) errs.slug = "Slug is required";
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim()))
      errs.slug = "Slug must be lowercase with hyphens (e.g. getting-started)";
    if (!form.section_id.trim()) errs.section_id = "Section is required";
    if (!form.title.trim()) errs.title = "Title is required";
    if (!form.body.trim()) errs.body = "Body is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) onSave(form);
  };

  // Auto-generate slug from title (only in create mode)
  const autoSlug = () => {
    if (mode === "create" && !form.slug && form.title) {
      setForm((f) => ({
        ...f,
        slug: form.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            {mode === "create" ? "Create Help Topic" : "Edit Help Topic"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a new help topic. An embedding will be generated automatically for search."
              : "Update this help topic. The embedding will be regenerated if content changes."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Title</label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onBlur={autoSlug}
              placeholder="e.g. How to use the terminal"
              autoFocus
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          {/* Slug */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Slug</label>
            <Input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
              placeholder="e.g. how-to-use-terminal"
              className="font-mono text-xs"
            />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
          </div>

          {/* Section */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Section</label>
            <div className="flex gap-2">
              <Input
                value={form.section_id}
                onChange={(e) => setForm((f) => ({ ...f, section_id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                placeholder="e.g. getting-started"
                className="font-mono text-xs"
                list="section-suggestions"
              />
              <datalist id="section-suggestions">
                {existingSections.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            {errors.section_id && <p className="text-xs text-destructive">{errors.section_id}</p>}
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Body</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Help topic content..."
              rows={6}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
            />
            {errors.body && <p className="text-xs text-destructive">{errors.body}</p>}
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Tags (comma-separated)</label>
            <Input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="e.g. terminal, basics, commands"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
              {mode === "create" ? "Create" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------------
// Delete confirmation dialog
// -------------------------------------------------------------------

function DeleteDialog({
  open,
  onOpenChange,
  topic,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic: HelpTopic | null;
  saving: boolean;
  onConfirm: () => void;
}) {
  if (!topic) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Help Topic</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{topic.title}&rdquo;? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------------
// Main component
// -------------------------------------------------------------------

export function HelpTopicManagement() {
  const { topics, loading, error, saving, refresh, createTopic, updateTopic, deleteTopic } = useHelpAdmin();

  const [searchQuery, setSearchQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formInitial, setFormInitial] = useState<TopicFormData>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HelpTopic | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  // Computed: unique sections
  const sections = useMemo(
    () => [...new Set(topics.map((t) => t.section_id))].sort(),
    [topics]
  );

  // Filtered topics
  const filtered = useMemo(() => {
    let result = topics;
    if (sectionFilter) result = result.filter((t) => t.section_id === sectionFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return result;
  }, [topics, sectionFilter, searchQuery]);

  // Grouped by section
  const grouped = useMemo(() => {
    const map: Record<string, HelpTopic[]> = {};
    for (const t of filtered) {
      if (!map[t.section_id]) map[t.section_id] = [];
      map[t.section_id].push(t);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggleSection = (s: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  // Handlers
  const handleCreate = () => {
    setFormMode("create");
    setFormInitial(emptyForm());
    setEditingId(null);
    setFormOpen(true);
  };

  const handleEdit = (topic: HelpTopic) => {
    setFormMode("edit");
    setFormInitial(topicToForm(topic));
    setEditingId(topic.id);
    setFormOpen(true);
  };

  const handleDelete = (topic: HelpTopic) => {
    setDeleteTarget(topic);
    setDeleteOpen(true);
  };

  const handleSave = async (data: TopicFormData) => {
    setActionError(null);
    const tags = data.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (formMode === "create") {
        await createTopic({ slug: data.slug, section_id: data.section_id, title: data.title, body: data.body, tags });
      } else if (editingId) {
        await updateTopic(editingId, { slug: data.slug, section_id: data.section_id, title: data.title, body: data.body, tags });
      }
      setFormOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setActionError(null);
    try {
      await deleteTopic(deleteTarget.id);
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Help Topics</h2>
          <Badge variant="secondary" className="text-[10px]">
            {topics.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("h-3 w-3 mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-3 w-3 mr-1.5" />
            New Topic
          </Button>
        </div>
      </div>

      {/* Errors */}
      {(error || actionError) && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{actionError || error}</span>
          {actionError && (
            <button type="button" onClick={() => setActionError(null)} className="ml-auto">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Search + Section filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topics by title, body, slug, or tag..."
            className="pl-9 h-8 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {sections.length > 1 && (
          <SectionFilter sections={sections} selected={sectionFilter} onSelect={setSectionFilter} />
        )}
      </div>

      {/* Topic list */}
      {loading && !topics.length ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <BookOpen className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            {searchQuery || sectionFilter ? "No matching topics found." : "No help topics yet."}
          </p>
          {!searchQuery && !sectionFilter && (
            <Button variant="outline" size="sm" onClick={handleCreate}>
              <Plus className="h-3 w-3 mr-1.5" />
              Create your first topic
            </Button>
          )}
        </div>
      ) : (
        <ScrollArea className="max-h-[calc(100vh-380px)]">
          <div className="space-y-4">
            {grouped.map(([sectionId, sectionTopics]) => {
              const collapsed = collapsedSections.has(sectionId);
              return (
                <div key={sectionId} className="border rounded-lg">
                  <button
                    type="button"
                    onClick={() => toggleSection(sectionId)}
                    className="flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
                  >
                    <div className="flex items-center gap-2">
                      {collapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {sectionId.replace(/-/g, " ")}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {sectionTopics.length}
                      </Badge>
                    </div>
                  </button>

                  {!collapsed && (
                    <div className="divide-y">
                      {sectionTopics.map((topic) => (
                        <div
                          key={topic.id}
                          className="px-4 py-3 hover:bg-muted/30 transition-colors group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-medium truncate">{topic.title}</h4>
                                <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                                  {topic.slug}
                                </code>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {topic.body}
                              </p>
                              {topic.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {topic.tags.map((tag) => (
                                    <Badge key={tag} variant="outline" className="text-[10px] py-0">
                                      <Tag className="h-2.5 w-2.5 mr-0.5" />
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleEdit(topic)}
                                title="Edit topic"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(topic)}
                                title="Delete topic"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Dialogs */}
      <TopicFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={formInitial}
        existingSections={sections}
        saving={saving}
        onSave={handleSave}
        mode={formMode}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        topic={deleteTarget}
        saving={saving}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
