import { useRef, useState } from "react";
import { Database, Plus, Trash2, Upload, Loader2, FileSpreadsheet, Eye } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useLookupTools, useCreateLookupTool, useUpdateLookupTool, useDeleteLookupTool,
  useLookupRows, useReplaceLookupRows, type LookupTool, type LookupColumn,
} from "@/hooks/useLookupTools";
import { toast } from "sonner";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "col";

interface Props {
  activityId: string;
  canEdit: boolean;
}

export const LookupToolsManager = ({ activityId, canEdit }: Props) => {
  const { data: tools = [] } = useLookupTools(activityId);
  const [openTool, setOpenTool] = useState<LookupTool | null>(null);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Database className="mr-2 h-4 w-4" /> Outils
          {tools.length > 0 && <span className="ml-1.5 rounded bg-primary/10 px-1.5 text-xs text-primary">{tools.length}</span>}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Outils de référence</SheetTitle>
          <SheetDescription>
            Importez des fichiers Excel/CSV qui serviront à pré-remplir automatiquement les colonnes.
            Exemple : un outil « Info PM » qui contient le CPL pour chaque PM.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-2">
          {tools.length === 0 && (
            <div className="rounded-md border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
              Aucun outil pour l'instant.
            </div>
          )}
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => setOpenTool(t)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card p-3 text-left hover:border-primary/50"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{t.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  Clé : <span className="font-mono">{t.key_column}</span> · {t.columns.length} colonne{t.columns.length > 1 ? "s" : ""}
                </p>
              </div>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        {canEdit && <CreateToolDialog activityId={activityId} />}

        {openTool && (
          <ToolDetailDialog
            tool={openTool}
            activityId={activityId}
            canEdit={canEdit}
            onClose={() => setOpenTool(null)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};

// ─────────────────────────────────────────────────────────────────
const CreateToolDialog = ({ activityId }: { activityId: string }) => {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parsed, setParsed] = useState<{ headers: string[]; rows: any[] } | null>(null);
  const [keyHeader, setKeyHeader] = useState("");
  const createMut = useCreateLookupTool(activityId);
  

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
      if (!aoa.length) throw new Error("Fichier vide");
      const headers = (aoa[0] as any[]).map((h) => String(h ?? "").trim()).filter(Boolean);
      if (!headers.length) throw new Error("Aucun en-tête trouvé");
      const rows = aoa.slice(1).map((r) => {
        const o: any = {};
        headers.forEach((h, i) => (o[h] = (r as any[])[i] ?? null));
        return o;
      }).filter((r) => Object.values(r).some((v) => v !== null && v !== ""));
      setParsed({ headers, rows });
      setKeyHeader(headers[0]);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    } catch (e: any) { toast.error(e.message); }
  };

  const reset = () => {
    setOpen(false); setName(""); setDescription(""); setParsed(null); setKeyHeader("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    if (!name.trim()) return toast.error("Nom requis");
    if (!parsed || !keyHeader) return toast.error("Importez un fichier d'abord");
    const columns: LookupColumn[] = parsed.headers
      .filter((h) => h !== keyHeader)
      .map((h) => ({ key: norm(h), label: h }));
    const keyCol = norm(keyHeader);
    try {
      const tool = await createMut.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        key_column: keyCol,
        columns,
      });
      // Insert rows
      const rowsToInsert = parsed.rows
        .map((r) => {
          const kv = String(r[keyHeader] ?? "").trim();
          if (!kv) return null;
          const data: Record<string, any> = {};
          for (const c of columns) data[c.key] = r[c.label];
          return { key_value: kv, data };
        })
        .filter(Boolean) as { key_value: string; data: Record<string, any> }[];

      // Direct call (replaceMut bound to "" so we re-do here)
      await (await import("@/integrations/supabase/client")).supabase
        .from("lookup_rows")
        .insert(rowsToInsert.map((r) => ({ tool_id: tool.id, ...r })));
      toast.success(`Outil créé avec ${rowsToInsert.length} ligne(s)`);
      reset();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button className="mt-6 w-full"><Plus className="mr-2 h-4 w-4" /> Créer un outil</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvel outil de référence</DialogTitle>
          <DialogDescription>
            Importez un fichier Excel/CSV. La 1ʳᵉ ligne doit contenir les en-têtes. Choisissez la colonne clé (ex : « PM »).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Fichier (.xlsx, .csv)</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>

          {parsed && (
            <>
              <div className="space-y-2">
                <Label>Nom de l'outil</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Info PM" />
              </div>
              <div className="space-y-2">
                <Label>Description (optionnel)</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Colonne clé (utilisée pour le lookup)</Label>
                <Select value={keyHeader} onValueChange={setKeyHeader}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {parsed.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                <p className="font-medium mb-1">Aperçu : {parsed.rows.length} ligne{parsed.rows.length > 1 ? "s" : ""}, {parsed.headers.length} colonne{parsed.headers.length > 1 ? "s" : ""}</p>
                <p className="text-muted-foreground">
                  Colonnes valeurs : {parsed.headers.filter((h) => h !== keyHeader).join(", ") || "(aucune)"}
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={reset}>Annuler</Button>
          <Button onClick={submit} disabled={createMut.isPending || !parsed}>
            {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer l'outil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────
const ToolDetailDialog = ({
  tool, activityId, canEdit, onClose,
}: { tool: LookupTool; activityId: string; canEdit: boolean; onClose: () => void }) => {
  const { data: rows = [], isLoading } = useLookupRows(tool.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const updateMut = useUpdateLookupTool(activityId);
  const deleteMut = useDeleteLookupTool(activityId);
  const replaceMut = useReplaceLookupRows(tool.id);
  const [name, setName] = useState(tool.name);

  const handleReimport = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
      if (!aoa.length) throw new Error("Fichier vide");
      const headers = (aoa[0] as any[]).map((h) => String(h ?? "").trim()).filter(Boolean);
      const dataRows = aoa.slice(1).map((r) => {
        const o: any = {};
        headers.forEach((h, i) => (o[h] = (r as any[])[i] ?? null));
        return o;
      }).filter((r) => Object.values(r).some((v) => v !== null && v !== ""));

      // Match key column by normalized name
      const keyHeader = headers.find((h) => norm(h) === tool.key_column);
      if (!keyHeader) throw new Error(`Colonne clé "${tool.key_column}" introuvable dans le fichier`);

      const newRows = dataRows.map((r) => {
        const kv = String(r[keyHeader] ?? "").trim();
        if (!kv) return null;
        const data: Record<string, any> = {};
        for (const c of tool.columns) {
          const matchHeader = headers.find((h) => norm(h) === c.key);
          if (matchHeader) data[c.key] = r[matchHeader];
        }
        return { key_value: kv, data };
      }).filter(Boolean) as { key_value: string; data: Record<string, any> }[];

      await replaceMut.mutateAsync(newRows);
      toast.success(`${newRows.length} ligne(s) réimportée(s)`);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) { toast.error(e.message); }
  };

  const saveName = async () => {
    if (name.trim() === tool.name) return;
    try {
      await updateMut.mutateAsync({ id: tool.id, name: name.trim() });
      toast.success("Renommé");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {canEdit ? (
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} className="h-8 max-w-xs" />
            ) : tool.name}
          </DialogTitle>
          <DialogDescription>
            Clé : <span className="font-mono">{tool.key_column}</span> · {tool.columns.length} colonne(s) · {rows.length} ligne(s)
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-auto rounded-md border border-border">
          {isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Aucune donnée</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{tool.key_column}</th>
                  {tool.columns.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-left font-medium">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono">{r.key_value}</td>
                    {tool.columns.map((c) => (
                      <td key={c.key} className="px-3 py-1.5">{r.data[c.key] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rows.length > 200 && (
            <p className="border-t border-border bg-muted/30 px-3 py-1.5 text-center text-xs text-muted-foreground">
              … {rows.length - 200} ligne(s) supplémentaire(s) non affichée(s)
            </p>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {canEdit && (
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReimport(f); }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={replaceMut.isPending}>
                {replaceMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Réimporter
              </Button>
              <Button
                variant="outline" size="sm" className="text-destructive hover:text-destructive"
                onClick={async () => {
                  if (!confirm(`Supprimer l'outil "${tool.name}" et toutes ses données ?`)) return;
                  try { await deleteMut.mutateAsync(tool.id); toast.success("Supprimé"); onClose(); }
                  catch (e: any) { toast.error(e.message); }
                }}
              ><Trash2 className="mr-2 h-4 w-4" /> Supprimer</Button>
            </div>
          )}
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
