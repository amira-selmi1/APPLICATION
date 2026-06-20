import * as XLSX from "xlsx";
import type { Attribute, Instance, AttributeType } from "@/hooks/useActivities";

export const exportToXlsx = (filename: string, attributes: Attribute[], instances: Instance[]) => {
  const sorted = [...attributes].sort((a, b) => a.position - b.position);
  const headers = sorted.map((a) => a.label);
  const rows = instances.map((inst) =>
    sorted.map((a) => {
      const v = inst.data?.[a.key];
      if (v === null || v === undefined) return "";
      if (a.type === "boolean") return v ? "Oui" : "Non";
      return v;
    })
  );
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Données");
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export interface ImportRow { [k: string]: any }
export interface ImportPlan {
  headers: string[];
  rows: ImportRow[];
  newColumns: { label: string; key: string; type: AttributeType }[];
  matchedColumns: { label: string; attribute: Attribute }[];
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const inferType = (samples: any[]): AttributeType => {
  const nonEmpty = samples.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonEmpty.length === 0) return "text";
  if (nonEmpty.every((v) => v === true || v === false || ["oui", "non", "true", "false", "1", "0"].includes(String(v).toLowerCase()))) return "boolean";
  if (nonEmpty.every((v) => !isNaN(Number(v)))) return "number";
  if (nonEmpty.every((v) => !isNaN(Date.parse(String(v))) && /\d{4}|\d{2}[-/]\d{2}/.test(String(v)))) return "date";
  return "text";
};

export const parseXlsx = async (file: File, existing: Attribute[]): Promise<ImportPlan> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  if (!aoa.length) throw new Error("Fichier vide");
  const headers = (aoa[0] as any[]).map((h) => String(h ?? "").trim()).filter(Boolean);
  const rows = aoa.slice(1).map((r) => {
    const o: ImportRow = {};
    headers.forEach((h, i) => (o[h] = (r as any[])[i] ?? null));
    return o;
  });

  const matched: ImportPlan["matchedColumns"] = [];
  const newCols: ImportPlan["newColumns"] = [];
  for (const h of headers) {
    const k = norm(h);
    const found = existing.find((a) => a.key === k || a.label.toLowerCase() === h.toLowerCase());
    if (found) matched.push({ label: h, attribute: found });
    else {
      const samples = rows.slice(0, 50).map((r) => r[h]);
      newCols.push({ label: h, key: k || `col_${headers.indexOf(h)}`, type: inferType(samples) });
    }
  }
  return { headers, rows, newColumns: newCols, matchedColumns: matched };
};

export const coerceValue = (raw: any, type: AttributeType) => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (type === "number") { const n = Number(raw); return isNaN(n) ? null : n; }
  if (type === "boolean") {
    if (typeof raw === "boolean") return raw;
    return ["oui", "true", "1", "yes"].includes(String(raw).toLowerCase());
  }
  if (type === "date") {
    if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    const d = new Date(raw); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return String(raw);
};
