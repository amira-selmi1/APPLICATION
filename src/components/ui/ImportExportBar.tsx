import { useRef, useState } from "react";
import { Upload, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Attribute, Instance } from "@/hooks/useActivities";
import { parseXlsx, exportToXlsx, coerceValue, type ImportPlan } from "@/lib/xlsx";

interface Props {
  activityId: string;
  activityName: string;
  attributes: Attribute[];
  instances: Instance[];
  canWrite: boolean;
}

export const ImportExportBar = ({ activityId, activityName, attributes, instances, canWrite }: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [importing, setImporting] = useState(false);
  const qc = useQueryClient();

  const handleFile = async (file: File) => {
    try {
      const p = await parseXlsx(file, attributes);
      setPlan(p);
    } catch (e: any) { toast.error(e.message); }
  };

  const runImport = async () => {
    if (!plan) return;
    setImporting(true);
    try {
      // 1. Create missing columns
      const createdAttrs: Record<string, Attribute> = {};
      for (const nc of plan.newColumns) {
        const { data, error } = await supabase.from("attributes").insert({
          activity_id: activityId,
          key: nc.key, label: nc.label, type: nc.type,
          position: (attributes[attributes.length - 1]?.position ?? 0) + 1,
        }).select().single();
        if (error) throw error;
        createdAttrs[nc.label] = data as Attribute;
      }
      // 2. Build header → attribute mapping
      const colMap: Record<string, Attribute> = {};
      for (const m of plan.matchedColumns) colMap[m.label] = m.attribute;
      Object.assign(colMap, createdAttrs);

      // 3. Insert rows in batches of 200
      const { data: u } = await supabase.auth.getUser();
      const allInserts = plan.rows.map((row) => {
        const data: Record<string, any> = {};
        for (const h of plan.headers) {
          const a = colMap[h];
          if (!a) continue;
          data[a.key] = coerceValue(row[h], a.type);
        }
        return { activity_id: activityId, data, created_by: u.user?.id, updated_by: u.user?.id };
      });
      for (let i = 0; i < allInserts.length; i += 200) {
        const slice = allInserts.slice(i, i + 200);
        const { error } = await supabase.from("instances").insert(slice);
        if (error) throw error;
      }
      toast.success(`${allInserts.length} lignes importées · ${plan.newColumns.length} colonnes créées`);
      qc.invalidateQueries({ queryKey: ["instances", activityId] });
      qc.invalidateQueries({ queryKey: ["attributes", activityId] });
      setPlan(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setImporting(false); }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

      <Button variant="outline" size="sm" onClick={() => exportToXlsx(activityName, attributes, instances)} disabled={!attributes.length}>
        <Download className="mr-2 h-4 w-4" /> Exporter
      </Button>
      {canWrite && (
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" /> Importer
        </Button>
      )}

      <Dialog open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aperçu de l'import</DialogTitle>
            <DialogDescription>Vérifiez la correspondance des colonnes avant de valider.</DialogDescription>
          </DialogHeader>
          {plan && (
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-2xl font-display font-bold">{plan.rows.length}</p>
                  <p className="text-xs text-muted-foreground">Lignes</p>
                </div>
                <div className="rounded-lg border bg-success/10 p-3">
                  <p className="text-2xl font-display font-bold text-success">{plan.matchedColumns.length}</p>
                  <p className="text-xs text-muted-foreground">Colonnes existantes</p>
                </div>
                <div className="rounded-lg border bg-info/10 p-3">
                  <p className="text-2xl font-display font-bold text-info">{plan.newColumns.length}</p>
                  <p className="text-xs text-muted-foreground">Nouvelles colonnes</p>
                </div>
              </div>
              <div className="space-y-1">
                {plan.matchedColumns.map((m) => (
                  <div key={m.label} className="flex items-center justify-between rounded-md border bg-card p-2 text-sm">
                    <span className="font-medium">{m.label}</span>
                    <Badge variant="outline" className="border-success/30 text-success">→ {m.attribute.label}</Badge>
                  </div>
                ))}
                {plan.newColumns.map((c) => (
                  <div key={c.label} className="flex items-center justify-between rounded-md border bg-card p-2 text-sm">
                    <span className="font-medium">{c.label}</span>
                    <Badge variant="outline" className="border-info/30 text-info">Nouvelle ({c.type})</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlan(null)} disabled={importing}>Annuler</Button>
            <Button onClick={runImport} disabled={importing}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importer {plan?.rows.length} lignes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
