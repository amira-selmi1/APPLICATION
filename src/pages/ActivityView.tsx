import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Loader2, Search, Filter, X, PencilLine, Database, Users } from "lucide-react";
import { useActivity, useAttributes, useInstances, useProfiles } from "@/hooks/useActivities";
import { useCreateInstance, useDeleteInstances, useBulkUpdateInstances } from "@/hooks/useTableMutations";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AttributeManager } from "@/components/ui/AttributeManager";
import { ImportExportBar } from "@/components/ui/ImportExportBar";
import { DataGrid, type BulkPatch } from "@/components/ui/DataGrid";
import { BulkEditDialog } from "@/components/ui/BulkEditDialog";
import { ActivityConsultantsManager } from "@/components/ui/ActivityConsultantsManager";
import type { ColumnFilterValue } from "@/components/ui/ColumnFilter";
import { toast } from "sonner";

const STREAMLIT_URL = import.meta.env.VITE_STREAMLIT_URL ?? "http://localhost:8501";
const BRANCHE_KEYS = ["branche", "Branche", "branch", "code_branche"];
const PM_KEYS = ["reference", "Reference", "REFERENCE", "ref_pm", "pm", "PM"];

function pickValue(data: Record<string, any> | null | undefined, keys: string[]): string {
  if (!data) return "";
  for (const k of keys) {
    const v = data[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

const ActivityView = () => {
  const { id } = useParams<{ id: string }>();
  const { isAdmin, isSuperviseur, user } = useAuth();
  const [canAdminActivity, setCanAdminActivity] = useState(false);
  const [canWriteActivity, setCanWriteActivity] = useState(false);
  const [canReadActivity, setCanReadActivity] = useState(false);
  const [myDisplayName, setMyDisplayName] = useState<string>("");

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      const [{ data: perm }, { data: prof }] = await Promise.all([
        supabase.from("activity_permissions").select("can_admin, can_write, can_read").eq("user_id", user.id).eq("activity_id", id).maybeSingle(),
        supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      ]);
      setCanAdminActivity(!!perm?.can_admin);
      setCanWriteActivity(!!perm?.can_write);
      setCanReadActivity(!!perm?.can_read);
      setMyDisplayName(prof?.display_name ?? "");
    })();
  }, [user, id]);

  const { data: activity } = useActivity(id);
  const { data: attributes = [], isLoading: attrLoading } = useAttributes(id);
  const { data: instances = [], isLoading: insLoading } = useInstances(id);
  const { data: profiles = [] } = useProfiles();
  const createIns = useCreateInstance(id!);
  const deleteIns = useDeleteInstances(id!);
  const bulkUpdate = useBulkUpdateInstances(id!);
  const qc = useQueryClient();

  const [globalFilter, setGlobalFilter] = useState("");
  const deferredGlobalFilter = useDeferredValue(globalFilter);
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterValue>>({});
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [addCount, setAddCount] = useState(1);

  const normalizeIdentity = (value: string) => value.trim().toLowerCase();

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`activity-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "instances", filter: `activity_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["instances", id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "attributes", filter: `activity_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["attributes", id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  const statusAttr = attributes.find((a) => a.is_status);
  const canWrite = isAdmin || isSuperviseur || canAdminActivity || canWriteActivity;
  // Consultants assignés peuvent modifier dates et statut uniquement
  const canWritePartial = canWrite || canReadActivity;
  const isReferente = isAdmin || isSuperviseur || canAdminActivity;
  const acteurAttr = attributes.find((a) => a.key.toLowerCase() === "acteur");

  const visibleInstances = useMemo(() => {
    let rows = instances;
    if (!isReferente && acteurAttr && user) {
      const candidates = [myDisplayName, user.email ?? "", (user.email ?? "").split("@")[0]]
        .map(normalizeIdentity).filter(Boolean);
      rows = rows.filter((r) => {
        const v = normalizeIdentity(String(r.data?.[acteurAttr.key] ?? ""));
        return v && candidates.includes(v);
      });
    }
    if (statusFilter !== "__all__" && statusAttr) {
      rows = rows.filter((r) => (r.data?.[statusAttr.key] ?? null) === (statusFilter === "__none__" ? null : statusFilter));
    }
    if (deferredGlobalFilter.trim()) {
      const q = deferredGlobalFilter.toLowerCase();
      rows = rows.filter((r) => Object.values(r.data ?? {}).some((v) => String(v ?? "").toLowerCase().includes(q)));
    }
    return rows;
  }, [instances, deferredGlobalFilter, statusFilter, statusAttr, isReferente, acteurAttr, user, myDisplayName]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const handleAddRows = async () => {
    try {
      for (let i = 0; i < addCount; i++) await createIns.mutateAsync({});
      if (addCount > 1) toast.success(`${addCount} lignes ajoutées`);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleOpenCapacityRobot = () => {
    const params = new URLSearchParams();
    if (id) params.set("activity_id", id);
    if (selectedIds.length === 1) {
      const row = instances.find((i) => i.id === selectedIds[0]);
      if (row) {
        params.set("instance_id", row.id);
        const branche = pickValue(row.data, BRANCHE_KEYS);
        const pm = pickValue(row.data, PM_KEYS);
        if (branche) params.set("branche", branche);
        if (pm) params.set("pm", pm);
      }
    } else if (selectedIds.length > 1) {
      toast.info("Sélectionnez une seule ligne pour pré-remplir le robot, ou aucune pour le lancer à vide.");
    }
    window.open(`${STREAMLIT_URL}/?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  const enrichWithLookups = async (patches: BulkPatch[]): Promise<BulkPatch[]> => {
    const lookupTargets: Record<string, { toolId: string; targetKey: string; column: string }[]> = {};
    for (const a of attributes) {
      if (a.lookup_tool_id && a.lookup_source_attr && a.lookup_column) {
        (lookupTargets[a.lookup_source_attr] ||= []).push({
          toolId: a.lookup_tool_id, targetKey: a.key, column: a.lookup_column,
        });
      }
    }
    if (Object.keys(lookupTargets).length === 0) return patches;
    const toResolve = new Map<string, Set<string>>();
    const patchKeys: { patchIdx: number; sourceAttr: string; keyValue: string }[] = [];
    patches.forEach((p, idx) => {
      for (const sourceAttr of Object.keys(lookupTargets)) {
        if (sourceAttr in p.patch) {
          const kv = p.patch[sourceAttr];
          if (kv == null || kv === "") continue;
          const kvStr = String(kv).trim();
          if (!kvStr) continue;
          patchKeys.push({ patchIdx: idx, sourceAttr, keyValue: kvStr });
          for (const t of lookupTargets[sourceAttr]) {
            (toResolve.get(t.toolId) || toResolve.set(t.toolId, new Set()).get(t.toolId)!).add(kvStr.toLowerCase());
          }
        }
      }
    });
    if (!patchKeys.length) return patches;
    const cache: Record<string, Record<string, Record<string, any>>> = {};
    await Promise.all(Array.from(toResolve.entries()).map(async ([toolId, keys]) => {
      const arr = Array.from(keys);
      const { data, error } = await supabase
        .from("lookup_rows").select("key_value,data").eq("tool_id", toolId)
        .in("key_value", arr.length > 0 ? Array.from(new Set(arr.flatMap((k) => [k, k.toUpperCase(), k.toLowerCase()]))) : []);
      if (error) return;
      const m: Record<string, Record<string, any>> = {};
      for (const r of data ?? []) m[String(r.key_value).toLowerCase()] = (r.data as Record<string, any>) ?? {};
      cache[toolId] = m;
    }));
    const enriched = patches.map((p) => ({ ...p, patch: { ...p.patch } }));
    for (const pk of patchKeys) {
      for (const t of lookupTargets[pk.sourceAttr]) {
        const found = cache[t.toolId]?.[pk.keyValue.toLowerCase()];
        enriched[pk.patchIdx].patch[t.targetKey] = (found && t.column in found) ? found[t.column] : null;
      }
    }
    return enriched;
  };

  const handleCommitMany = async (patches: BulkPatch[]) => {
    if (!patches.length) return;
    const enriched = await enrichWithLookups(patches);
    const results = await bulkUpdate.mutateAsync(
      enriched.map((p) => ({ id: p.rowId, currentData: p.currentData, currentVersion: p.currentVersion, patch: p.patch }))
    );
    const failed = results.filter((r) => !r.ok);
    if (failed.length) toast.error(`${failed.length} ligne(s) en conflit. Rechargez.`);
  };

  const handleBulkApply = async (key: string, value: any) => {
    const targets = instances.filter((i) => selected[i.id]);
    const patches = targets.map((t) => ({
      id: t.id, currentData: t.data ?? {}, currentVersion: t.version,
      patch: { [key]: value === "__clear__" ? null : value },
    }));
    const results = await bulkUpdate.mutateAsync(patches);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) throw new Error(`${failed.length} conflit(s)`);
  };

  const activeColFilters = Object.values(columnFilters).filter(Boolean).length;

  if (!activity && !attrLoading) {
    return <div className="p-6"><p>Activité introuvable</p></div>;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col md:h-screen">
      <header className="border-b border-border bg-card px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Button variant="ghost" size="sm" asChild className="-ml-2 h-7 text-xs text-muted-foreground">
              <Link to="/activities"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Activités</Link>
            </Button>
            <h1 className="font-display text-xl truncate">{activity?.name}</h1>
            <p className="text-xs text-muted-foreground font-mono">{activity?.code} · {instances.length} ligne{instances.length > 1 ? "s" : ""}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/capacitaire/i.test(activity?.name ?? "") && (
              <Button variant="outline" size="sm" onClick={handleOpenCapacityRobot} title="Ouvrir le robot d'analyse capacitaire FTTH">
                <Database className="mr-2 h-4 w-4" /> Outil
              </Button>
            )}
            {(isAdmin || isSuperviseur) && (
              <ActivityConsultantsManager activityId={id!} />
            )}
            <ImportExportBar activityId={id!} activityName={activity?.code ?? "export"} attributes={attributes} instances={instances} canWrite={canWrite} />
            <AttributeManager activityId={id!} attributes={attributes} canEdit={canWrite} />
            {canWrite && (
              <div className="flex items-center gap-1 rounded-md border border-input bg-background">
                <Input type="number" min={1} max={500} value={addCount}
                  onChange={(e) => setAddCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  className="h-8 w-14 border-0 px-2 text-center text-sm" />
                <Button size="sm" variant="ghost" className="h-8 rounded-l-none border-l border-input" onClick={handleAddRows} disabled={createIns.isPending}>
                  {createIns.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                  Ligne{addCount > 1 ? "s" : ""}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder="Rechercher partout…" className="h-8 pl-8 text-sm" />
          </div>
          {statusAttr && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-44 text-sm"><Filter className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous les statuts</SelectItem>
                <SelectItem value="__none__">Sans statut</SelectItem>
                {(statusAttr.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {activeColFilters > 0 && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setColumnFilters({})}>
              <X className="mr-1 h-3 w-3" /> {activeColFilters} filtre{activeColFilters > 1 ? "s" : ""} colonne
            </Button>
          )}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1 text-sm">
              <Badge variant="default">{selectedIds.length}</Badge>
              <span>sélectionnée{selectedIds.length > 1 ? "s" : ""}</span>
              {canWrite && (
                <>
                  <Button size="sm" variant="ghost" className="h-6" onClick={() => setBulkEditOpen(true)}>
                    <PencilLine className="mr-1 h-3.5 w-3.5" /> Modifier en masse
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-destructive hover:text-destructive"
                    onClick={async () => {
                      if (!confirm(`Supprimer ${selectedIds.length} ligne${selectedIds.length > 1 ? "s" : ""} ?`)) return;
                      try { await deleteIns.mutateAsync(selectedIds); setSelected({}); toast.success("Lignes supprimées"); }
                      catch (e: any) { toast.error(e.message); }
                    }}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Supprimer
                  </Button>
                </>
              )}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSelected({})}><X className="h-3 w-3" /></Button>
            </div>
          )}
          <p className="ml-auto hidden text-xs text-muted-foreground md:block">
            Astuces : <kbd className="rounded bg-muted px-1">Ctrl+C/V</kbd> copier-coller · <kbd className="rounded bg-muted px-1">Ctrl+Entrée</kbd> appliquer à la sélection · <kbd className="rounded bg-muted px-1">Suppr</kbd> vider · poignée bleue = recopier
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {attrLoading || insLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : attributes.length === 0 ? (
          <div className="m-6 rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
            <p className="font-medium">Aucune colonne</p>
            <p className="text-sm text-muted-foreground">Ajoutez vos premières colonnes via le menu « Colonnes ».</p>
          </div>
        ) : (
          <DataGrid
            attributes={attributes}
            instances={visibleInstances}
            canWrite={canWrite}
            canWritePartial={canWritePartial}
            selectedRowIds={selected}
            onSelectedRowIdsChange={setSelected}
            filters={columnFilters}
            onFiltersChange={setColumnFilters}
            onCommitMany={handleCommitMany}
            profiles={profiles}
          />
        )}
      </div>

      <BulkEditDialog open={bulkEditOpen} onOpenChange={setBulkEditOpen} attributes={attributes} count={selectedIds.length} onApply={handleBulkApply} />
    </div>
  );
};

export default ActivityView;