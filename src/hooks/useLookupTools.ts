import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LookupColumn { key: string; label: string }
export interface LookupTool {
  id: string;
  activity_id: string;
  name: string;
  description: string | null;
  key_column: string;
  columns: LookupColumn[];
  created_at: string;
  updated_at: string;
}
export interface LookupRow {
  id: string;
  tool_id: string;
  key_value: string;
  data: Record<string, any>;
}

export const useLookupTools = (activityId?: string) =>
  useQuery({
    queryKey: ["lookup_tools", activityId],
    enabled: !!activityId,
    queryFn: async (): Promise<LookupTool[]> => {
      const { data, error } = await supabase
        .from("lookup_tools")
        .select("*")
        .eq("activity_id", activityId!)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        ...t,
        columns: Array.isArray(t.columns) ? t.columns : [],
      })) as LookupTool[];
    },
  });

export const useLookupRows = (toolId?: string) =>
  useQuery({
    queryKey: ["lookup_rows", toolId],
    enabled: !!toolId,
    queryFn: async (): Promise<LookupRow[]> => {
      const { data, error } = await supabase
        .from("lookup_rows")
        .select("*")
        .eq("tool_id", toolId!)
        .order("key_value")
        .limit(20000);
      if (error) throw error;
      return (data ?? []) as LookupRow[];
    },
  });

export const useCreateLookupTool = (activityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: { name: string; description?: string; key_column: string; columns: LookupColumn[] }) => {
      const { data, error } = await supabase.from("lookup_tools")
        .insert({ activity_id: activityId, name: t.name, description: t.description, key_column: t.key_column, columns: t.columns as any })
        .select().single();
      if (error) throw error;
      return data as unknown as LookupTool;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lookup_tools", activityId] }),
  });
};

export const useUpdateLookupTool = (activityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; description?: string; key_column?: string; columns?: LookupColumn[] }) => {
      const { error } = await supabase.from("lookup_tools").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lookup_tools", activityId] }),
  });
};

export const useDeleteLookupTool = (activityId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lookup_tools").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lookup_tools", activityId] }),
  });
};

export const useReplaceLookupRows = (toolId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { key_value: string; data: Record<string, any> }[]) => {
      // Remplace tout le contenu de l'outil
      const { error: e1 } = await supabase.from("lookup_rows").delete().eq("tool_id", toolId);
      if (e1) throw e1;
      if (!rows.length) return 0;
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize).map((r) => ({ tool_id: toolId, ...r }));
        const { error } = await supabase.from("lookup_rows").insert(chunk);
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lookup_rows", toolId] }),
  });
};
