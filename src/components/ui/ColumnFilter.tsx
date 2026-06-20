import { useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Attribute } from "@/hooks/useActivities";
import { cn } from "@/lib/utils";

export type ColumnFilterValue =
  | { type: "text"; contains: string }
  | { type: "number"; op: "eq" | "gt" | "lt" | "between"; a?: number; b?: number }
  | { type: "date"; from?: string; to?: string }
  | { type: "enum"; values: string[] }
  | { type: "boolean"; value: boolean | null }
  | null;

interface Props {
  attribute: Attribute;
  value: ColumnFilterValue;
  onChange: (v: ColumnFilterValue) => void;
  distinctValues?: string[]; // pour text/enum/etc
}

export const ColumnFilter = ({ attribute, value, onChange, distinctValues = [] }: Props) => {
  const [open, setOpen] = useState(false);
  const active = !!value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn("h-5 w-5 shrink-0", active && "text-primary bg-primary/10")}
          onClick={(e) => e.stopPropagation()}
        >
          <Filter className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtrer {attribute.label}</p>
          {active && (
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => { onChange(null); setOpen(false); }}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {attribute.type === "text" && (
          <Input
            autoFocus
            placeholder="Contient…"
            value={(value as any)?.contains ?? ""}
            onChange={(e) => onChange(e.target.value ? { type: "text", contains: e.target.value } : null)}
            className="h-8"
          />
        )}

        {attribute.type === "number" && (() => {
          const v: any = value ?? { type: "number", op: "eq" };
          return (
            <div className="space-y-2">
              <Select value={v.op} onValueChange={(op) => onChange({ ...v, type: "number", op })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eq">= égal à</SelectItem>
                  <SelectItem value="gt">&gt; supérieur à</SelectItem>
                  <SelectItem value="lt">&lt; inférieur à</SelectItem>
                  <SelectItem value="between">entre</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" placeholder="Valeur" value={v.a ?? ""} onChange={(e) => onChange({ ...v, type: "number", a: e.target.value === "" ? undefined : Number(e.target.value) })} className="h-8" />
              {v.op === "between" && (
                <Input type="number" placeholder="et" value={v.b ?? ""} onChange={(e) => onChange({ ...v, type: "number", b: e.target.value === "" ? undefined : Number(e.target.value) })} className="h-8" />
              )}
            </div>
          );
        })()}

        {attribute.type === "date" && (() => {
          const v: any = value ?? { type: "date" };
          return (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Du</Label>
                <Input type="date" value={v.from ?? ""} onChange={(e) => onChange({ ...v, type: "date", from: e.target.value || undefined })} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Au</Label>
                <Input type="date" value={v.to ?? ""} onChange={(e) => onChange({ ...v, type: "date", to: e.target.value || undefined })} className="h-8" />
              </div>
            </div>
          );
        })()}

        {attribute.type === "enum" && (() => {
          const v: any = value ?? { type: "enum", values: [] };
          const opts = attribute.options ?? distinctValues;
          return (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {opts.map((o) => {
                const checked = v.values?.includes(o);
                return (
                  <label key={o} className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        const set = new Set<string>(v.values ?? []);
                        if (c) set.add(o); else set.delete(o);
                        onChange(set.size ? { type: "enum", values: Array.from(set) } : null);
                      }}
                    />
                    <span className="text-sm">{o}</span>
                  </label>
                );
              })}
            </div>
          );
        })()}

        {attribute.type === "boolean" && (() => {
          const v: any = value ?? { type: "boolean", value: null };
          return (
            <Select
              value={v.value === null || v.value === undefined ? "all" : v.value ? "true" : "false"}
              onValueChange={(s) => onChange(s === "all" ? null : { type: "boolean", value: s === "true" })}
            >
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="true">Oui</SelectItem>
                <SelectItem value="false">Non</SelectItem>
              </SelectContent>
            </Select>
          );
        })()}
      </PopoverContent>
    </Popover>
  );
};

export const matchesFilter = (val: any, filter: ColumnFilterValue): boolean => {
  if (!filter) return true;
  if (filter.type === "text") {
    return String(val ?? "").toLowerCase().includes(filter.contains.toLowerCase());
  }
  if (filter.type === "number") {
    const n = val === null || val === undefined || val === "" ? null : Number(val);
    if (n === null || isNaN(n)) return false;
    if (filter.op === "eq") return filter.a !== undefined && n === filter.a;
    if (filter.op === "gt") return filter.a !== undefined && n > filter.a;
    if (filter.op === "lt") return filter.a !== undefined && n < filter.a;
    if (filter.op === "between") return filter.a !== undefined && filter.b !== undefined && n >= Math.min(filter.a, filter.b) && n <= Math.max(filter.a, filter.b);
  }
  if (filter.type === "date") {
    if (!val) return false;
    const d = String(val);
    if (filter.from && d < filter.from) return false;
    if (filter.to && d > filter.to) return false;
    return true;
  }
  if (filter.type === "enum") {
    return filter.values.includes(String(val ?? ""));
  }
  if (filter.type === "boolean") {
    return !!val === filter.value;
  }
  return true;
};
