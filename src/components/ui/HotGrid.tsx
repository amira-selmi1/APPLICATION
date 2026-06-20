import { useEffect, useMemo, useRef } from "react";
import { HotTable, HotTableClass } from "@handsontable/react";
import Handsontable from "handsontable";
import { registerAllModules } from "handsontable/registry";
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";
import type { Attribute, Instance } from "@/hooks/useActivities";

registerAllModules();

export interface BulkPatch {
  rowId: string;
  currentData: Record<string, any>;
  currentVersion: number;
  patch: Record<string, any>;
}

interface Props {
  attributes: Attribute[];
  instances: Instance[];
  canWrite: boolean;
  selectedRowIds: Record<string, boolean>;
  onSelectedRowIdsChange: (ids: Record<string, boolean>) => void;
  onCommitMany: (patches: BulkPatch[]) => Promise<void> | void;
}

const STATUS_COLORS: Record<string, string> = {
  "Affecté": "#3b82f6",
  "En cours": "#f59e0b",
  "Réalisé": "#16a34a",
  "Bloqué": "#dc2626",
};

export function HotGrid({
  attributes,
  instances,
  canWrite,
  selectedRowIds,
  onSelectedRowIdsChange,
  onCommitMany,
}: Props) {
  const hotRef = useRef<HotTableClass | null>(null);

  // Build column definitions
  const columns = useMemo<Handsontable.ColumnSettings[]>(() => {
    const sorted = [...attributes].sort((a, b) => a.position - b.position);
    return sorted.map<Handsontable.ColumnSettings>((attr) => {
      const base: Handsontable.ColumnSettings = {
        data: attr.key,
        title: attr.label,
        readOnly: !canWrite,
      };
      switch (attr.type) {
        case "number":
          return { ...base, type: "numeric", numericFormat: { pattern: "0.[000]" } };
        case "date":
          return { ...base, type: "date", dateFormat: "YYYY-MM-DD", correctFormat: true };
        case "boolean":
          return { ...base, type: "checkbox", className: "htCenter" };
        case "enum":
          return {
            ...base,
            type: "dropdown",
            source: attr.options ?? [],
            allowInvalid: false,
            renderer: attr.is_status ? statusRenderer : undefined,
          };
        default:
          return { ...base, type: "text" };
      }
    });
  }, [attributes, canWrite]);

  const colHeaders = useMemo(
    () => [...attributes].sort((a, b) => a.position - b.position).map((a) => a.label),
    [attributes]
  );

  // rows as plain objects keyed by attribute key + __id
  const rows = useMemo(
    () =>
      instances.map((i) => ({
        __id: i.id,
        __version: i.version,
        ...attributes.reduce<Record<string, any>>((acc, a) => {
          acc[a.key] = i.data?.[a.key] ?? null;
          return acc;
        }, {}),
      })),
    [instances, attributes]
  );

  // Sync selection from checkboxes -> selectedRowIds
  // (Handsontable's row selection is separate; we expose selection via afterSelectionEnd)
  useEffect(() => {
    const hot = hotRef.current?.hotInstance;
    if (!hot) return;
  }, [rows]);

  return (
    <div className="hot-wrapper ht-theme-main h-full min-h-[420px] w-full">
      <HotTable
        ref={hotRef}
        data={rows}
        columns={columns}
        colHeaders={colHeaders}
        rowHeaders={(idx) => {
          const id = rows[idx]?.__id;
          const checked = id && selectedRowIds[id] ? "✓" : String(idx + 1);
          return `<span class="hot-row-header">${checked}</span>`;
        }}
        height="100%"
        width="100%"
        stretchH="all"
        rowHeights={32}
        colWidths={140}
        manualColumnResize
        manualRowResize
        manualColumnMove
        contextMenu={canWrite}
        filters
        dropdownMenu
        columnSorting
        copyPaste
        fillHandle={canWrite ? { autoInsertRow: false } : false}
        autoWrapRow
        autoWrapCol
        outsideClickDeselects={false}
        licenseKey="non-commercial-and-evaluation"
        afterChange={(changes, source) => {
          if (!changes || source === "loadData" || !canWrite) return;
          // Group changes by row
          const byRow = new Map<number, Record<string, any>>();
          changes.forEach(([row, prop, oldV, newV]) => {
            if (oldV === newV) return;
            const r = byRow.get(row as number) ?? {};
            r[prop as string] = newV;
            byRow.set(row as number, r);
          });
          if (byRow.size === 0) return;
          const patches: BulkPatch[] = [];
          byRow.forEach((patch, rowIdx) => {
            const inst = instances[rowIdx];
            if (!inst) return;
            patches.push({
              rowId: inst.id,
              currentData: inst.data ?? {},
              currentVersion: inst.version,
              patch,
            });
          });
          if (patches.length) onCommitMany(patches);
        }}
        afterOnCellMouseDown={(_event, coords) => {
          // Toggle selection when clicking on the row header (col === -1)
          if (coords.col === -1 && coords.row >= 0) {
            const id = rows[coords.row]?.__id;
            if (!id) return;
            const next = { ...selectedRowIds };
            if (next[id]) delete next[id];
            else next[id] = true;
            onSelectedRowIdsChange(next);
          }
        }}
      />
    </div>
  );
}

function statusRenderer(
  _instance: Handsontable,
  td: HTMLTableCellElement,
  _row: number,
  _col: number,
  _prop: string | number,
  value: any
) {
  td.innerHTML = "";
  if (value == null || value === "") {
    td.style.background = "";
    return td;
  }
  const color = STATUS_COLORS[value] ?? "#64748b";
  td.style.background = `${color}15`;
  td.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;font-weight:500;color:${color}">
    <span style="width:8px;height:8px;border-radius:9999px;background:${color}"></span>${value}
  </span>`;
  return td;
}
