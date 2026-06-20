import { useEffect, useRef, useState } from "react";
import type { Attribute } from "@/hooks/useActivities";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  attribute: Attribute;
  value: any;
  onCommit: (next: any) => Promise<void> | void;
  disabled?: boolean;
}

export const EditableCell = ({ attribute, value, onCommit, disabled }: Props) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value ?? ""); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = async () => {
    setEditing(false);
    let next: any = draft;
    if (attribute.type === "number") next = draft === "" || draft === null ? null : Number(draft);
    if (attribute.type === "date") next = draft || null;
    if (next === value) return;
    await onCommit(next);
  };

  // Booleans render as a checkbox (no edit mode)
  if (attribute.type === "boolean") {
    return (
      <div className="flex items-center justify-center h-full">
        <Checkbox
          checked={!!value}
          disabled={disabled}
          onCheckedChange={(c) => onCommit(!!c)}
        />
      </div>
    );
  }

  // Enums render a Select inline
  if (attribute.type === "enum") {
    const opts = attribute.options ?? [];
    return (
      <Select
        disabled={disabled}
        value={value ?? ""}
        onValueChange={(v) => onCommit(v === "__clear__" ? null : v)}
      >
        <SelectTrigger className="h-8 border-0 bg-transparent shadow-none focus:ring-1 focus:ring-primary">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__clear__"><span className="text-muted-foreground">— vide —</span></SelectItem>
          {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type={attribute.type === "number" ? "number" : attribute.type === "date" ? "date" : "text"}
        value={draft ?? ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setEditing(false); setDraft(value ?? ""); }
        }}
        className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-primary"
      />
    );
  }

  return (
    <div
      className="h-8 cursor-text px-2 py-1 text-sm flex items-center hover:bg-muted/50 rounded"
      onClick={() => !disabled && setEditing(true)}
    >
      {value === null || value === undefined || value === ""
        ? <span className="text-muted-foreground/60">—</span>
        : attribute.type === "date"
        ? new Date(value).toLocaleDateString("fr-FR")
        : String(value)}
    </div>
  );
};
