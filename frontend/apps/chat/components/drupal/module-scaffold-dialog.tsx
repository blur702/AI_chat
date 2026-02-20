"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
} from "@workstation/ui";
import { Loader2 } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";

interface Props {
  open: boolean;
  onClose: () => void;
  onScaffold: (data: {
    machine_name: string;
    name: string;
    description?: string;
    package?: string;
  }) => Promise<any>;
}

export function ModuleScaffoldDialog({ open, onClose, onScaffold }: Props) {
  const [machineName, setMachineName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pkg, setPkg] = useState("Custom");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!machineName.trim() || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onScaffold({
        machine_name: machineName.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        package: pkg.trim() || undefined,
      });
      // Reset and close
      setMachineName("");
      setName("");
      setDescription("");
      setPkg("Custom");
      onClose();
    } catch (e: any) {
      setError(e.message || "Scaffold failed");
    } finally {
      setLoading(false);
    }
  }, [machineName, name, description, pkg, onScaffold, onClose]);

  // Auto-generate machine name from display name
  const handleNameChange = (val: string) => {
    setName(val);
    if (!machineName || machineName === nameToMachine(name)) {
      setMachineName(nameToMachine(val));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scaffold New Module</DialogTitle>
          <DialogDescription>
            Creates a new custom module with boilerplate files (.info.yml, .module, .routing.yml).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor="mod-name" className="text-sm font-medium inline-flex items-center gap-1.5">
              Module Name
              <FieldHelp
                slug="drupal-module-name"
                tip="Human-readable module title shown in Drupal admin."
              />
            </label>
            <Input
              id="mod-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My Custom Module"
              aria-required="true"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mod-machine" className="text-sm font-medium inline-flex items-center gap-1.5">
              Machine Name
              <FieldHelp
                slug="drupal-module-machine-name"
                tip="Code-safe identifier used in file names and module keys."
              />
            </label>
            <Input
              id="mod-machine"
              value={machineName}
              onChange={(e) => {
                const sanitized = e.target.value
                  .replace(/[^a-z0-9_]/g, "")
                  .replace(/^[0-9_]+/, "");
                setMachineName(sanitized);
              }}
              placeholder="my_custom_module"
              className="font-mono"
              pattern="^[a-z][a-z0-9_]*$"
              aria-required="true"
              aria-describedby="machine-name-hint"
            />
            <p id="machine-name-hint" className="text-xs text-muted-foreground">
              Lowercase letters, numbers, underscores only. Must start with a letter.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mod-desc" className="text-sm font-medium inline-flex items-center gap-1.5">
              Description
              <FieldHelp
                slug="drupal-module-description"
                tip="Short explanation of what this module does."
              />
            </label>
            <Input
              id="mod-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of this module"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mod-pkg" className="text-sm font-medium inline-flex items-center gap-1.5">
              Package
              <FieldHelp
                slug="drupal-module-package"
                tip="Admin grouping label used to organize modules."
              />
            </label>
            <Input
              id="mod-pkg"
              value={pkg}
              onChange={(e) => setPkg(e.target.value)}
              placeholder="Custom"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !machineName.trim() || !name.trim()}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Module
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function nameToMachine(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .replace(/^[0-9]+/, "");
}
