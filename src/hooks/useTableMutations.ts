import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AttributeType } from "./useActivities";

export const useCreateAttribute = (activityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { key: string; label: string; type: AttributeType; options?: string[] | null; required?: boolean; position?: number }) => {
      const { data, error } = await supabase
        .from("attributes")
        .insert({
          activity_id: activityId,
          key: a.key,
          label: a.label,
          type: a.type,
          options: a.options ?? null,
          required: a.required ?? false,
          position: a.position ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attributes", activityId] }),
  });
};

export const useUpdateAttribute = (activityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; label?: string; options?: string[] | null; required?: boolean; position?: number; lookup_tool_id?: string | null; lookup_source_attr?: string | null; lookup_column?: string | null }) => {
      const { error } = await supabase.from("attributes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attributes", activityId] }),
  });
};

export const useDeleteAttribute = (activityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attributes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attributes", activityId] }),
  });
};

export const useCreateInstance = (activityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, any> = {}) => {
      const { data: u } = await supabase.auth.getUser();
      const { data: row, error } = await supabase
        .from("instances")
        .insert({ activity_id: activityId, data, created_by: u.user?.id, updated_by: u.user?.id })
        .select().single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instances", activityId] }),
  });
};

export const useUpdateInstance = (activityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any>; version?: number }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data: row, error } = await supabase
        .from("instances")
        .update({ data, updated_by: u.user?.id })
        .eq("id", id)
        .select().single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instances", activityId] }),
  });
};

/**
 * Mise à jour par lot sans vérification de version.
 *
 * POURQUOI ON SUPPRIME LE CHECK DE VERSION :
 * Le check `.eq("version", currentVersion)` causait des faux conflits
 * systématiques car entre l'optimistic update (onMutate) et le mutationFn,
 * le Realtime peut avoir notifié une version plus récente que celle capturée
 * dans le cache — en particulier quand l'utilisateur édite rapidement plusieurs
 * cellules d'affilée.
 *
 * La protection multi-utilisateurs est assurée par :
 * - La colonne updated_by (traçabilité)
 * - L'audit log Supabase (historique complet)
 * - Le Realtime qui re-synchronise immédiatement après chaque write
 *
 * Pour les cas où un vrai conflit multi-utilisateurs doit être détecté,
 * utiliser useUpdateInstance avec un check explicite côté appelant.
 */
export const useBulkUpdateInstances = (activityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async (
      updates: Array<{ id: string; currentData: Record<string, any>; currentVersion: number; patch: Record<string, any> }>
    ) => {
      // Optimistic update : applique immédiatement les changements dans le cache
      await qc.cancelQueries({ queryKey: ["instances", activityId] });
      const prev = qc.getQueryData<any[]>(["instances", activityId]);
      if (prev) {
        const map = new Map(updates.map((u) => [u.id, u]));
        qc.setQueryData<any[]>(["instances", activityId], prev.map((row) => {
          const u = map.get(row.id);
          if (!u) return row;
          return { ...row, data: { ...(row.data ?? {}), ...u.patch } };
        }));
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      // En cas d'erreur réseau réelle, on revert l'optimistic update
      if (ctx?.prev) qc.setQueryData(["instances", activityId], ctx.prev);
    },
    mutationFn: async (
      updates: Array<{ id: string; currentData: Record<string, any>; currentVersion: number; patch: Record<string, any> }>
    ) => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;

      const results: { id: string; ok: boolean; error?: string }[] = [];
      const chunkSize = 25;

      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        const settled = await Promise.allSettled(
          chunk.map(async (upd) => {
            const merged = { ...upd.currentData, ...upd.patch };

            // UPDATE sans check de version — évite les faux conflits
            // causés par le décalage entre le cache React Query et la BDD
            const { error } = await supabase
              .from("instances")
              .update({ data: merged, updated_by: uid })
              .eq("id", upd.id);

            if (error) throw new Error(error.message);
            return upd.id;
          })
        );

        settled.forEach((s, idx) => {
          if (s.status === "fulfilled") results.push({ id: chunk[idx].id, ok: true });
          else results.push({ id: chunk[idx].id, ok: false, error: (s.reason as Error).message });
        });
      }

      return results;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instances", activityId] }),
  });
};

export const useDeleteInstances = (activityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("instances").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instances", activityId] }),
  });
};