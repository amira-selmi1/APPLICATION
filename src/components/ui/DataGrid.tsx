import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Attribute, Instance } from "@/hooks/useActivities";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ColumnFilter, matchesFilter, type ColumnFilterValue } from "@/components/ui/ColumnFilter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DayPicker } from "react-day-picker";
import { fr } from "date-fns/locale";
import "react-day-picker/style.css";

// ---------- Date helpers (robust, no timezone drift) ----------
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const formatDateDDMMYYYY = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    const d = String(value.getUTCDate()).padStart(2, "0");
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${value.getUTCFullYear()}`;
  }
  const num = typeof value === "number" ? value : (/^\d{10,13}$/.test(String(value).trim()) ? Number(value) : NaN);
  if (!isNaN(num) && num > 0) {
    const ms = num > 1e12 ? num : num * 1000;
    const dt = new Date(ms);
    if (!isNaN(dt.getTime())) {
      const dd = String(dt.getUTCDate()).padStart(2, "0");
      const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
      return `${dd}/${mm}/${dt.getUTCFullYear()}`;
    }
  }
  const s = String(value).trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    let y = dmy[3]; if (y.length === 2) y = "20" + y;
    return `${d}/${m}/${y}`;
  }
  const verbose = s.match(/\b([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b/);
  if (verbose) {
    const mNum = MONTHS[verbose[1].toLowerCase()];
    if (mNum) return `${verbose[2].padStart(2, "0")}/${String(mNum).padStart(2, "0")}/${verbose[3]}`;
  }
  return s;
};

// ---------- Clipboard helpers (fallback pour HTTP local) ----------
/**
 * Copie du texte dans le presse-papiers.
 * Utilise navigator.clipboard (HTTPS/contextes sécurisés) avec fallback
 * sur document.execCommand("copy") pour HTTP local (localhost en dev).
 */
async function writeClipboard(text: string): Promise<void> {
  // Méthode moderne — fonctionne en HTTPS ou si le contexte est sécurisé
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fallback ci-dessous
    }
  }
  // Fallback execCommand — fonctionne en HTTP local (localhost)
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("execCommand copy failed");
}

/**
 * Lit le presse-papiers.
 * navigator.clipboard.readText() nécessite une permission explicite en HTTP.
 * En cas d'échec, on retourne null et on laisse l'appelant afficher un message.
 */
async function readClipboard(): Promise<string | null> {
  if (navigator.clipboard && window.isSecureContext) {
    try { return await navigator.clipboard.readText(); } catch { return null; }
  }
  return null; // execCommand paste n'est plus supporté dans Chrome moderne
}

export interface BulkPatch {
  rowId: string;
  currentData: Record<string, any>;
  currentVersion: number;
  patch: Record<string, any>;
}

interface Profile { user_id: string; display_name: string | null; email: string | null; }

interface Props {
  attributes: Attribute[];
  instances: Instance[];
  canWrite: boolean;
  canWritePartial?: boolean;
  selectedRowIds: Record<string, boolean>;
  onSelectedRowIdsChange: (next: Record<string, boolean>) => void;
  filters: Record<string, ColumnFilterValue>;
  onFiltersChange: (next: Record<string, ColumnFilterValue>) => void;
  onCommitMany: (patches: BulkPatch[]) => Promise<void>;
  profiles?: Profile[];
}

interface CellRef { r: number; c: number; }

const coerce = (raw: string, attr: Attribute): any => {
  if (raw === "" || raw === null || raw === undefined) return null;
  if (attr.type === "number") {
    const n = Number(String(raw).replace(",", "."));
    return isNaN(n) ? null : n;
  }
  if (attr.type === "boolean") {
    const s = String(raw).trim().toLowerCase();
    return ["1", "true", "vrai", "oui", "yes", "x"].includes(s);
  }
  if (attr.type === "date") {
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const dd = m[1].padStart(2, "0");
      const mm = m[2].padStart(2, "0");
      let yy = m[3]; if (yy.length === 2) yy = "20" + yy;
      return `${yy}-${mm}-${dd}`;
    }
    return raw;
  }
  if (attr.type === "enum") {
    const opts = attr.options ?? [];
    const found = opts.find((o) => o.toLowerCase() === String(raw).trim().toLowerCase());
    return found ?? null;
  }
  return String(raw);
};

const formatForCopy = (v: any, attr: Attribute): string => {
  if (v === null || v === undefined) return "";
  if (attr.type === "boolean") return v ? "1" : "0";
  if (attr.type === "date") return formatDateDDMMYYYY(v);
  return String(v);
};

const storedToDate = (v: any): Date | undefined => {
  if (!v) return undefined;
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const num = /^\d{10,13}$/.test(s) ? Number(s) : NaN;
  if (!isNaN(num)) {
    const ms = num > 1e12 ? num : num * 1000;
    const dt = new Date(ms);
    if (!isNaN(dt.getTime())) return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  }
  return undefined;
};

const dateToStored = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const DatePickerCell = ({ value, canWrite, onWrite }: { value: any; canWrite: boolean; onWrite: (v: string | null) => void }) => {
  const [open, setOpen] = useState(false);
  const selected = storedToDate(value);
  return (
    <Popover open={canWrite ? open : false} onOpenChange={canWrite ? setOpen : undefined}>
      <PopoverTrigger asChild>
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className={cn("h-6 px-2 py-0.5 text-[12px] flex items-center overflow-hidden whitespace-nowrap", canWrite && "cursor-pointer hover:bg-muted/30")}
        >
          {value ? formatDateDDMMYYYY(value) : <span className="text-muted-foreground/40">—</span>}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={(date) => { onWrite(date ? dateToStored(date) : null); setOpen(false); }}
          locale={fr}
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  );
};

export const DataGrid = ({
  attributes, instances, canWrite,
  canWritePartial = false,
  selectedRowIds, onSelectedRowIdsChange,
  filters, onFiltersChange, onCommitMany,
  profiles = [],
}: Props) => {
  const sortedAttrs = useMemo(() => {
    const byPos = [...attributes].sort((a, b) => a.position - b.position);
    const nonStatus = byPos.filter((a) => !a.is_status);
    const status = byPos.filter((a) => a.is_status);
    return [...nonStatus, ...status];
  }, [attributes]);

  const activeFilters = useMemo(
    () => sortedAttrs
      .map((a) => ({ attr: a, filter: filters[a.key] ?? null }))
      .filter(({ filter }) => !!filter),
    [sortedAttrs, filters]
  );

  const rows = useMemo(() => {
    if (activeFilters.length === 0) return instances;
    return instances.filter((inst) =>
      activeFilters.every(({ attr, filter }) => matchesFilter(inst.data?.[attr.key], filter))
    );
  }, [instances, activeFilters]);

  const colWidths = useMemo(() => {
    const CHAR_PX = 7;
    const PADDING = 42;
    const MIN = 96;
    const MAX = 240;
    const widths: Record<string, number> = {};
    for (const a of sortedAttrs) {
      const labelWidth = ((a.label ?? a.key).length + 2) * CHAR_PX + PADDING;
      let w = Math.max(MIN, Math.min(MAX, labelWidth));
      if (a.type === "date") w = Math.max(w, 110);
      widths[a.key] = w;
    }
    return widths;
  }, [sortedAttrs]);

  const [anchor, setAnchor] = useState<CellRef | null>(null);
  const [focus, setFocus] = useState<CellRef | null>(null);
  const [editing, setEditing] = useState<CellRef | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");
  const [dragMode, setDragMode] = useState<"select" | "fill" | "row" | null>(null);
  const [fillStart, setFillStart] = useState<CellRef | null>(null);
  const [rowDragStart, setRowDragStart] = useState<number | null>(null);
  const [rowDragAdditive, setRowDragAdditive] = useState(false);
  const [rowDragBase, setRowDragBase] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (anchor && (anchor.r >= rows.length || anchor.c >= sortedAttrs.length)) {
      setAnchor(null); setFocus(null); setEditing(null);
    }
  }, [rows.length, sortedAttrs.length, anchor]);

  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing]);

  const inSelection = useCallback((r: number, c: number) => {
    if (!anchor || !focus) return false;
    const r1 = Math.min(anchor.r, focus.r), r2 = Math.max(anchor.r, focus.r);
    const c1 = Math.min(anchor.c, focus.c), c2 = Math.max(anchor.c, focus.c);
    return r >= r1 && r <= r2 && c >= c1 && c <= c2;
  }, [anchor, focus]);

  const selectionBounds = useMemo(() => {
    if (!anchor || !focus) return null;
    return {
      r1: Math.min(anchor.r, focus.r), r2: Math.max(anchor.r, focus.r),
      c1: Math.min(anchor.c, focus.c), c2: Math.max(anchor.c, focus.c),
    };
  }, [anchor, focus]);

  const stateRef = useRef({ editing, anchor, focus, dragMode, fillStart, rows, sortedAttrs, rowDragStart, rowDragAdditive, rowDragBase, canWrite });
  stateRef.current = { editing, anchor, focus, dragMode, fillStart, rows, sortedAttrs, rowDragStart, rowDragAdditive, rowDragBase, canWrite };
  const onSelectedRowIdsChangeRef = useRef(onSelectedRowIdsChange);
  onSelectedRowIdsChangeRef.current = onSelectedRowIdsChange;

  const handleCellMouseDown = useCallback((r: number, c: number, e: React.MouseEvent) => {
    const s = stateRef.current;
    if (s.editing) return;
    if (e.shiftKey && s.anchor) { setFocus({ r, c }); return; }
    setAnchor({ r, c }); setFocus({ r, c });
    setDragMode("select");
    containerRef.current?.focus();
  }, []);
  const handleCellMouseEnter = useCallback((r: number, c: number) => {
    const s = stateRef.current;
    if (s.dragMode === "select") setFocus({ r, c });
    else if (s.dragMode === "fill" && s.fillStart) setFocus({ r, c: s.fillStart.c });
  }, []);
  const handleRowNumMouseEnter = useCallback((r: number) => {
    const s = stateRef.current;
    if (s.dragMode !== "row" || s.rowDragStart === null) return;
    const r1 = Math.min(s.rowDragStart, r), r2 = Math.max(s.rowDragStart, r);
    const lastCol = s.sortedAttrs.length - 1;
    setAnchor({ r: s.rowDragStart, c: 0 });
    setFocus({ r, c: lastCol });
    const next: Record<string, boolean> = s.rowDragAdditive ? { ...s.rowDragBase } : {};
    for (let i = r1; i <= r2; i++) { const rr = s.rows[i]; if (rr) next[rr.id] = true; }
    onSelectedRowIdsChangeRef.current(next);
  }, []);

  useEffect(() => {
    const onUp = async () => {
      if (dragMode === "fill" && fillStart && focus && canWrite) {
        const srcAttr = sortedAttrs[fillStart.c];
        const srcRow = rows[fillStart.r];
        const srcVal = srcRow?.data?.[srcAttr.key] ?? null;
        const r1 = Math.min(fillStart.r, focus.r);
        const r2 = Math.max(fillStart.r, focus.r);
        const patches: BulkPatch[] = [];
        for (let r = r1; r <= r2; r++) {
          if (r === fillStart.r) continue;
          const row = rows[r]; if (!row) continue;
          patches.push({ rowId: row.id, currentData: row.data ?? {}, currentVersion: row.version, patch: { [srcAttr.key]: srcVal } });
        }
        if (patches.length) {
          try { await onCommitMany(patches); }
          catch (e: any) { toast.error(e.message); }
        }
      }
      setDragMode(null); setFillStart(null); setRowDragStart(null);
    };
    if (dragMode) {
      window.addEventListener("mouseup", onUp);
      return () => window.removeEventListener("mouseup", onUp);
    }
  }, [dragMode, fillStart, focus, rows, sortedAttrs, canWrite, onCommitMany]);

  const startFillDrag = useCallback((r: number, c: number, e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    setFillStart({ r, c }); setAnchor({ r, c }); setFocus({ r, c });
    setDragMode("fill");
  }, []);

  const startEdit = useCallback((r: number, c: number, initial?: string) => {
    const s = stateRef.current;
    if (!s.canWrite) return;
    const attr = s.sortedAttrs[c];
    if (!attr) return;
    if (attr.type === "boolean" || attr.type === "enum" || attr.type === "date") return;
    const row = s.rows[r];
    const cur = row?.data?.[attr.key];
    setEditing({ r, c });
    setEditDraft(initial !== undefined ? initial : (cur === null || cur === undefined ? "" : String(cur)));
  }, []);

  const commitEdit = async (applyToSelection = false) => {
    if (!editing) return;
    const attr = sortedAttrs[editing.c];
    const next = coerce(editDraft, attr);
    const targets: { r: number; c: number }[] = [];
    if (applyToSelection && selectionBounds) {
      for (let r = selectionBounds.r1; r <= selectionBounds.r2; r++)
        for (let c = selectionBounds.c1; c <= selectionBounds.c2; c++)
          targets.push({ r, c });
    } else {
      targets.push(editing);
    }
    setEditing(null); setEditDraft("");
    const byRow = new Map<string, BulkPatch>();
    for (const t of targets) {
      const a = sortedAttrs[t.c]; const row = rows[t.r];
      if (!a || !row) continue;
      if (a.is_status && a.type !== "enum") continue;
      const coerced = coerce(editDraft, a);
      const cur = byRow.get(row.id) ?? { rowId: row.id, currentData: row.data ?? {}, currentVersion: row.version, patch: {} };
      cur.patch[a.key] = coerced === undefined ? next : coerced;
      byRow.set(row.id, cur);
    }
    if (byRow.size) {
      try { await onCommitMany(Array.from(byRow.values())); }
      catch (e: any) { toast.error(e.message); }
    }
  };

  const cancelEdit = useCallback(() => { setEditing(null); setEditDraft(""); }, []);

  const onCommitManyRef = useRef(onCommitMany);
  onCommitManyRef.current = onCommitMany;
  const writeSingle = useCallback(async (r: number, c: number, value: any) => {
    const s = stateRef.current;
    const attr = s.sortedAttrs[c]; const row = s.rows[r];
    if (!attr || !row) return;
    try {
      await onCommitManyRef.current([{ rowId: row.id, currentData: row.data ?? {}, currentVersion: row.version, patch: { [attr.key]: value } }]);
    } catch (e: any) { toast.error(e.message); }
  }, []);

  // ---------- Keyboard handlers ----------
  const onKeyDown = async (e: React.KeyboardEvent) => {
    if (editing) return;
    if (!anchor || !focus) return;
    const move = (dr: number, dc: number, extend = false) => {
      const nr = Math.max(0, Math.min(rows.length - 1, focus.r + dr));
      const nc = Math.max(0, Math.min(sortedAttrs.length - 1, focus.c + dc));
      if (extend) setFocus({ r: nr, c: nc });
      else { setAnchor({ r: nr, c: nc }); setFocus({ r: nr, c: nc }); }
      e.preventDefault();
    };

    // ── Copy ──
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      e.preventDefault();
      const sb = selectionBounds!;
      const lines: string[] = [];
      for (let r = sb.r1; r <= sb.r2; r++) {
        const cells: string[] = [];
        for (let c = sb.c1; c <= sb.c2; c++) {
          const a = sortedAttrs[c]; const row = rows[r];
          cells.push(formatForCopy(row?.data?.[a.key], a));
        }
        lines.push(cells.join("\t"));
      }
      try {
        await writeClipboard(lines.join("\n"));
        toast.success(`${(sb.r2 - sb.r1 + 1) * (sb.c2 - sb.c1 + 1)} cellule(s) copiée(s)`);
      } catch {
        toast.error("Impossible de copier — autorisez l'accès au presse-papiers");
      }
      return;
    }

    // ── Paste ──
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && canWrite) {
      e.preventDefault();
      const text = await readClipboard();
      if (text === null) {
        toast.error("Coller non disponible en HTTP local — utilisez Ctrl+Maj+V ou autorisez le presse-papiers");
        return;
      }
      try {
        const matrix = text.replace(/\r/g, "").split("\n").filter((l, i, arr) => !(i === arr.length - 1 && l === "")).map((l) => l.split("\t"));
        const startR = Math.min(anchor.r, focus.r);
        const startC = Math.min(anchor.c, focus.c);
        const sb = selectionBounds!;
        const isSingle = matrix.length === 1 && matrix[0].length === 1;
        const byRow = new Map<string, BulkPatch>();
        if (isSingle) {
          const raw = matrix[0][0];
          for (let r = sb.r1; r <= sb.r2; r++) {
            for (let c = sb.c1; c <= sb.c2; c++) {
              const a = sortedAttrs[c]; const row = rows[r];
              if (!a || !row || a.is_status) continue;
              const cur = byRow.get(row.id) ?? { rowId: row.id, currentData: row.data ?? {}, currentVersion: row.version, patch: {} };
              cur.patch[a.key] = coerce(raw, a); byRow.set(row.id, cur);
            }
          }
        } else {
          for (let i = 0; i < matrix.length; i++) {
            const r = startR + i; if (r >= rows.length) break;
            for (let j = 0; j < matrix[i].length; j++) {
              const c = startC + j; if (c >= sortedAttrs.length) break;
              const a = sortedAttrs[c]; const row = rows[r];
              if (!a || !row || a.is_status) continue;
              const cur = byRow.get(row.id) ?? { rowId: row.id, currentData: row.data ?? {}, currentVersion: row.version, patch: {} };
              cur.patch[a.key] = coerce(matrix[i][j], a); byRow.set(row.id, cur);
            }
          }
        }
        if (byRow.size) {
          await onCommitMany(Array.from(byRow.values()));
          toast.success(`${byRow.size} ligne(s) mise(s) à jour`);
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur de collage");
      }
      return;
    }

    // ── Delete ──
    if ((e.key === "Delete" || e.key === "Backspace") && canWrite) {
      e.preventDefault();
      const sb = selectionBounds!;
      const byRow = new Map<string, BulkPatch>();
      for (let r = sb.r1; r <= sb.r2; r++) {
        for (let c = sb.c1; c <= sb.c2; c++) {
          const a = sortedAttrs[c]; const row = rows[r];
          if (!a || !row || a.is_status) continue;
          const cur = byRow.get(row.id) ?? { rowId: row.id, currentData: row.data ?? {}, currentVersion: row.version, patch: {} };
          cur.patch[a.key] = a.type === "boolean" ? false : null;
          byRow.set(row.id, cur);
        }
      }
      if (byRow.size) await onCommitMany(Array.from(byRow.values()));
      return;
    }

    if (e.key === "ArrowUp") return move(-1, 0, e.shiftKey);
    if (e.key === "ArrowDown") return move(1, 0, e.shiftKey);
    if (e.key === "ArrowLeft") return move(0, -1, e.shiftKey);
    if (e.key === "ArrowRight") return move(0, 1, e.shiftKey);
    if (e.key === "Tab") return move(0, e.shiftKey ? -1 : 1);
    if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); startEdit(focus.r, focus.c); return; }
    if (canWrite && e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); startEdit(focus.r, focus.c, e.key); }
  };

  const allSelected = rows.length > 0 && rows.every((r) => selectedRowIds[r.id]);
  const toggleAll = (c: boolean) => {
    const next = { ...selectedRowIds };
    rows.forEach((r) => { if (c) next[r.id] = true; else delete next[r.id]; });
    onSelectedRowIdsChange(next);
  };
  const toggleRow = (id: string, c: boolean) => {
    const next = { ...selectedRowIds };
    if (c) next[id] = true; else delete next[id];
    onSelectedRowIdsChange(next);
  };

  const distinctByCol = useMemo(() => {
    const m: Record<string, string[]> = {};
    sortedAttrs.forEach((a) => {
      if (a.type !== "text") return;
      const set = new Set<string>();
      instances.forEach((i) => { const v = i.data?.[a.key]; if (v != null && v !== "") set.add(String(v)); });
      m[a.key] = Array.from(set).sort().slice(0, 50);
    });
    return m;
  }, [instances, sortedAttrs]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-radix-popper-content-wrapper], [role="dialog"], [role="listbox"], [role="menu"]')) return;
      setAnchor(null); setFocus(null); setEditing(null);
    };
    window.addEventListener("mousedown", onDocMouseDown);
    return () => window.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // ── Copier-coller global (focus hors tableau) ──
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s.anchor || !s.focus || s.editing) return;
      if (containerRef.current?.contains(document.activeElement)) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

      const sb = {
        r1: Math.min(s.anchor.r, s.focus.r), r2: Math.max(s.anchor.r, s.focus.r),
        c1: Math.min(s.anchor.c, s.focus.c), c2: Math.max(s.anchor.c, s.focus.c),
      };

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        const lines: string[] = [];
        for (let r = sb.r1; r <= sb.r2; r++) {
          const cells: string[] = [];
          for (let c = sb.c1; c <= sb.c2; c++) {
            const a = s.sortedAttrs[c]; const row = s.rows[r];
            cells.push(formatForCopy(row?.data?.[a.key], a));
          }
          lines.push(cells.join("\t"));
        }
        try {
          await writeClipboard(lines.join("\n"));
          toast.success(`${(sb.r2 - sb.r1 + 1) * (sb.c2 - sb.c1 + 1)} cellule(s) copiée(s)`);
        } catch {
          toast.error("Impossible de copier — autorisez l'accès au presse-papiers");
        }

      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && s.canWrite) {
        e.preventDefault();
        const text = await readClipboard();
        if (text === null) {
          toast.error("Coller non disponible en HTTP local — cliquez d'abord dans le tableau");
          return;
        }
        try {
          const matrix = text.replace(/\r/g, "").split("\n")
            .filter((l, i, arr) => !(i === arr.length - 1 && l === ""))
            .map((l) => l.split("\t"));
          const isSingle = matrix.length === 1 && matrix[0].length === 1;
          const byRow = new Map<string, BulkPatch>();
          if (isSingle) {
            const raw = matrix[0][0];
            for (let r = sb.r1; r <= sb.r2; r++) {
              for (let c = sb.c1; c <= sb.c2; c++) {
                const a = s.sortedAttrs[c]; const row = s.rows[r];
                if (!a || !row || a.is_status) continue;
                const cur = byRow.get(row.id) ?? { rowId: row.id, currentData: row.data ?? {}, currentVersion: row.version, patch: {} };
                cur.patch[a.key] = coerce(raw, a); byRow.set(row.id, cur);
              }
            }
          } else {
            for (let i = 0; i < matrix.length; i++) {
              const r = sb.r1 + i; if (r >= s.rows.length) break;
              for (let j = 0; j < matrix[i].length; j++) {
                const c = sb.c1 + j; if (c >= s.sortedAttrs.length) break;
                const a = s.sortedAttrs[c]; const row = s.rows[r];
                if (!a || !row || a.is_status) continue;
                const cur = byRow.get(row.id) ?? { rowId: row.id, currentData: row.data ?? {}, currentVersion: row.version, patch: {} };
                cur.patch[a.key] = coerce(matrix[i][j], a); byRow.set(row.id, cur);
              }
            }
          }
          if (byRow.size) {
            await onCommitManyRef.current(Array.from(byRow.values()));
            toast.success(`${byRow.size} ligne(s) mise(s) à jour`);
          }
        } catch (err: any) {
          toast.error(err?.message || "Erreur de collage");
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const selectWholeRow = (r: number, e: React.MouseEvent) => {
    const lastCol = sortedAttrs.length - 1;
    const row = rows[r];
    if (!row) return;
    if (e.shiftKey && anchor) {
      const r1 = Math.min(anchor.r, r), r2 = Math.max(anchor.r, r);
      setFocus({ r, c: lastCol });
      const next: Record<string, boolean> = {};
      for (let i = r1; i <= r2; i++) { const rr = rows[i]; if (rr) next[rr.id] = true; }
      onSelectedRowIdsChange(next);
    } else if (e.ctrlKey || e.metaKey) {
      setAnchor({ r, c: 0 }); setFocus({ r, c: lastCol });
      const next = { ...selectedRowIds };
      if (next[row.id]) delete next[row.id]; else next[row.id] = true;
      onSelectedRowIdsChange(next);
      setRowDragStart(r); setRowDragAdditive(true); setRowDragBase(next); setDragMode("row");
    } else {
      setAnchor({ r, c: 0 }); setFocus({ r, c: lastCol });
      onSelectedRowIdsChange({ [row.id]: true });
      setRowDragStart(r); setRowDragAdditive(false); setRowDragBase({}); setDragMode("row");
    }
    containerRef.current?.focus();
  };

  const selectWholeCol = (c: number, e: React.MouseEvent) => {
    const lastRow = rows.length - 1;
    if (lastRow < 0) return;
    if (e.shiftKey && anchor) setFocus({ r: lastRow, c });
    else { setAnchor({ r: 0, c }); setFocus({ r: lastRow, c }); }
    setDragMode("select");
    containerRef.current?.focus();
  };

  const handleHeaderMouseEnter = (c: number) => {
    if (dragMode !== "select" || !anchor) return;
    const lastRow = rows.length - 1;
    if (lastRow < 0) return;
    setAnchor({ r: 0, c: anchor.c });
    setFocus({ r: lastRow, c });
  };

  const ROW_H = 28;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
    getItemKey: (i) => rows[i]?.id ?? i,
  });
  const vItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = vItems.length > 0 ? vItems[0].start : 0;
  const paddingBottom = vItems.length > 0 ? totalSize - vItems[vItems.length - 1].end : 0;
  const totalCols = sortedAttrs.length + 1;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="outline-none focus:outline-none h-full overflow-auto"
      style={{ contain: "strict", willChange: "transform" }}
    >
      <table className="border-separate border-spacing-0 select-none text-[12px]" style={{ width: "auto", tableLayout: "fixed" }}>
        <thead className="sticky top-0 z-10 bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-sm">
          <tr>
            <th className="w-10 border-b border-r border-primary-foreground/20 px-1 py-1 text-center text-[11px] font-semibold text-primary-foreground/80">#</th>
            {sortedAttrs.map((attr, c) => {
              const isColSel = selectionBounds && selectionBounds.c1 <= c && c <= selectionBounds.c2;
              return (
                <th
                  key={attr.id}
                  style={{ width: colWidths[attr.key], minWidth: colWidths[attr.key], maxWidth: colWidths[attr.key] }}
                  className={cn(
                    "cursor-pointer border-b border-r border-primary-foreground/20 px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary-glow/40",
                    isColSel && "bg-primary-glow/50"
                  )}
                  onMouseDown={(e) => { if ((e.target as HTMLElement).closest("[data-column-filter]")) return; selectWholeCol(c, e); }}
                  onMouseEnter={() => handleHeaderMouseEnter(c)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{attr.label}</span>
                    <span data-column-filter onMouseDown={(e) => e.stopPropagation()}>
                      <ColumnFilter attribute={attr} value={filters[attr.key] ?? null} onChange={(v) => onFiltersChange({ ...filters, [attr.key]: v })} distinctValues={distinctByCol[attr.key]} />
                    </span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={totalCols} className="px-6 py-12 text-center text-muted-foreground">Aucune ligne</td></tr>
          ) : (
            <>
              {paddingTop > 0 && <tr aria-hidden="true"><td colSpan={totalCols} style={{ height: paddingTop, padding: 0, border: 0 }} /></tr>}
              {vItems.map((vi) => {
                const r = vi.index;
                const row = rows[r];
                if (!row) return null;
                const inSelRow = !!selectionBounds && selectionBounds.r1 <= r && r <= selectionBounds.r2;
                const focusCol = focus?.r === r ? focus.c : null;
                const editingCol = editing?.r === r ? editing.c : null;
                const fillCornerCol = (selectionBounds && selectionBounds.r2 === r && canWrite) ? selectionBounds.c2 : null;
                return (
                  <DataRow
                    key={row.id}
                    row={row} rowIndex={r} attrs={sortedAttrs} colWidths={colWidths}
                    isRowSelected={!!selectedRowIds[row.id]} inSelRow={inSelRow}
                    selC1={inSelRow ? selectionBounds!.c1 : -1} selC2={inSelRow ? selectionBounds!.c2 : -1}
                    focusCol={focusCol} editingCol={editingCol}
                    editDraft={editingCol !== null ? editDraft : ""}
                    fillCornerCol={fillCornerCol} canWrite={canWrite} canWritePartial={canWritePartial}
                    profiles={profiles}
                    onCellMouseDown={handleCellMouseDown} onCellMouseEnter={handleCellMouseEnter}
                    onRowNumMouseDown={selectWholeRow} onRowNumMouseEnter={handleRowNumMouseEnter}
                    onStartEdit={startEdit} onWriteSingle={writeSingle} onStartFillDrag={startFillDrag}
                    editInputRef={editInputRef} onEditDraftChange={setEditDraft}
                    onCommitEdit={commitEdit} onCancelEdit={cancelEdit}
                    onMoveAfterTab={(nr, nc) => { setAnchor({ r: nr, c: nc }); setFocus({ r: nr, c: nc }); }}
                  />
                );
              })}
              {paddingBottom > 0 && <tr aria-hidden="true"><td colSpan={totalCols} style={{ height: paddingBottom, padding: 0, border: 0 }} /></tr>}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};

interface DataRowProps {
  row: Instance; rowIndex: number; attrs: Attribute[]; colWidths: Record<string, number>;
  isRowSelected: boolean; inSelRow: boolean; selC1: number; selC2: number;
  focusCol: number | null; editingCol: number | null; editDraft: string;
  fillCornerCol: number | null; canWrite: boolean; canWritePartial: boolean;
  profiles: Profile[];
  onCellMouseDown: (r: number, c: number, e: React.MouseEvent) => void;
  onCellMouseEnter: (r: number, c: number) => void;
  onRowNumMouseDown: (r: number, e: React.MouseEvent) => void;
  onRowNumMouseEnter: (r: number) => void;
  onStartEdit: (r: number, c: number, initial?: string) => void;
  onWriteSingle: (r: number, c: number, v: any) => void;
  onStartFillDrag: (r: number, c: number, e: React.MouseEvent) => void;
  editInputRef: React.RefObject<HTMLInputElement>;
  onEditDraftChange: (v: string) => void;
  onCommitEdit: (applyToSelection?: boolean) => void;
  onCancelEdit: () => void;
  onMoveAfterTab: (r: number, c: number) => void;
}

const DataRowImpl = (props: DataRowProps) => {
  const {
    row, rowIndex: r, attrs, colWidths, isRowSelected, inSelRow, selC1, selC2,
    focusCol, editingCol, editDraft, fillCornerCol, canWrite, canWritePartial,
    onCellMouseDown, onCellMouseEnter, onRowNumMouseDown, onRowNumMouseEnter,
    onStartEdit, onWriteSingle, onStartFillDrag,
    editInputRef, onEditDraftChange, onCommitEdit, onCancelEdit, onMoveAfterTab,
    profiles,
  } = props;

  return (
    <tr className={cn("transition-colors bg-card", isRowSelected && "bg-primary/10")}>
      <td
        onMouseDown={(e) => onRowNumMouseDown(r, e)}
        onMouseEnter={() => onRowNumMouseEnter(r)}
        className={cn(
          "w-10 cursor-pointer border-b border-r border-border/60 bg-secondary/60 px-1 py-0 text-center text-[11px] font-medium text-muted-foreground hover:bg-primary/20 hover:text-primary",
          isRowSelected && "bg-primary text-primary-foreground font-semibold"
        )}
      >{r + 1}</td>
      {attrs.map((attr, c) => {
        const isFocus = focusCol === c;
        const isSel = inSelRow && c >= selC1 && c <= selC2;
        const isFillCorner = fillCornerCol === c;
        const value = row.data?.[attr.key];
        const isEditingHere = editingCol === c;
        return (
          <td
            key={attr.id}
            style={{ width: colWidths[attr.key], maxWidth: colWidths[attr.key], height: 28 }}
            onMouseDown={(e) => onCellMouseDown(r, c, e)}
            onMouseEnter={() => onCellMouseEnter(r, c)}
            onDoubleClick={() => onStartEdit(r, c)}
            className={cn(
              "relative overflow-hidden border-b border-r border-border/40 px-1 py-0 align-middle text-[12px] leading-tight",
              isSel && "bg-primary/10",
              isFocus && "ring-2 ring-inset ring-primary",
            )}
          >
            {isEditingHere ? (
              <Input
                ref={editInputRef}
                type={attr.type === "number" ? "number" : "text"}
                value={editDraft}
                onChange={(e) => onEditDraftChange(e.target.value)}
                onBlur={() => onCommitEdit(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onCommitEdit(e.ctrlKey || e.metaKey); }
                  else if (e.key === "Escape") { e.preventDefault(); onCancelEdit(); }
                  else if (e.key === "Tab") { e.preventDefault(); onCommitEdit(false); const nc = Math.min(attrs.length - 1, c + (e.shiftKey ? -1 : 1)); onMoveAfterTab(r, nc); }
                }}
                className="h-6 border-0 bg-background px-1 text-[12px] shadow-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            ) : attr.is_status ? (
              <Select disabled={!(canWrite || canWritePartial)} value={value ?? ""} onValueChange={(v) => onWriteSingle(r, c, v === "__clear__" ? null : v)}>
                <SelectTrigger className="h-6 border-0 bg-transparent p-1 text-[12px] shadow-none hover:bg-muted/30">
                  <SelectValue><StatusBadge value={value} /></SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__"><span className="text-muted-foreground">— vide —</span></SelectItem>
                  {(attr.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : attr.type === "boolean" ? (
              <div onClick={() => canWrite && onWriteSingle(r, c, !value)} className={cn("flex h-6 items-center px-2 text-[12px]", canWrite && "cursor-pointer", !value && "text-muted-foreground/40")}>
                {value ? "Oui" : "Non"}
              </div>
            ) : attr.key.toLowerCase() === "acteur" && profiles.length > 0 ? (
              // ── Liste déroulante acteur — tous les comptes de la plateforme ──
              <Select
                disabled={!canWrite}
                value={value ?? ""}
                onValueChange={(v) => onWriteSingle(r, c, v === "__clear__" ? null : v)}
              >
                <SelectTrigger className="h-6 border-0 bg-transparent px-1 text-[12px] shadow-none hover:bg-muted/30">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">
                    <span className="text-muted-foreground">— vide —</span>
                  </SelectItem>
                  {profiles.map((p) => {
                    const label = p.display_name || p.email || p.user_id;
                    return (
                      <SelectItem key={p.user_id} value={label}>
                        {p.display_name || p.email || p.user_id}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : attr.type === "enum" ? (
              <Select disabled={!canWrite} value={value ?? ""} onValueChange={(v) => onWriteSingle(r, c, v === "__clear__" ? null : v)}>
                <SelectTrigger className="h-6 border-0 bg-transparent px-1 text-[12px] shadow-none hover:bg-muted/30">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__"><span className="text-muted-foreground">— vide —</span></SelectItem>
                  {(attr.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : attr.type === "date" ? (
              <DatePickerCell value={value} canWrite={canWrite || canWritePartial} onWrite={(v) => onWriteSingle(r, c, v)} />
            ) : (
              <div className="h-6 cursor-cell px-2 py-0.5 text-[12px] flex items-center overflow-hidden whitespace-nowrap text-ellipsis">
                {value === null || value === undefined || value === ""
                  ? <span className="text-muted-foreground/40">—</span>
                  : /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/i.test(String(value ?? ""))
                    || /^\d{10,13}$/.test(String(value ?? ""))
                  ? formatDateDDMMYYYY(value)
                  : <span className="truncate">{String(value)}</span>}
              </div>
            )}
            {isFillCorner && !isEditingHere && (
              <div onMouseDown={(e) => onStartFillDrag(r, c, e)} title="Recopier vers le bas" className="absolute -bottom-[3px] -right-[3px] z-20 h-2 w-2 cursor-crosshair border border-background bg-primary" />
            )}
          </td>
        );
      })}
    </tr>
  );
};

const DataRow = memo(DataRowImpl, (prev, next) =>
  prev.row === next.row &&
  prev.rowIndex === next.rowIndex &&
  prev.attrs === next.attrs &&
  prev.colWidths === next.colWidths &&
  prev.isRowSelected === next.isRowSelected &&
  prev.inSelRow === next.inSelRow &&
  prev.selC1 === next.selC1 &&
  prev.selC2 === next.selC2 &&
  prev.focusCol === next.focusCol &&
  prev.editingCol === next.editingCol &&
  prev.editDraft === next.editDraft &&
  prev.fillCornerCol === next.fillCornerCol &&
  prev.canWrite === next.canWrite &&
  prev.canWritePartial === next.canWritePartial &&
  prev.onCellMouseDown === next.onCellMouseDown &&
  prev.onCellMouseEnter === next.onCellMouseEnter &&
  prev.onStartEdit === next.onStartEdit &&
  prev.onWriteSingle === next.onWriteSingle &&
  prev.profiles === next.profiles
);