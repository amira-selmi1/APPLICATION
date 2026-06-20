import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AttributeType = "text" | "number" | "date" | "enum" | "boolean";
export interface Attribute {
  id: string;
  activity_id: string;
  key: string;
  label: string;
  type: AttributeType;
  required: boolean;
  options: string[] | null;
  position: number;
  is_status: boolean;
  lookup_tool_id: string | null;
  lookup_source_attr: string | null;
  lookup_column: string | null;
}

export interface Activity {
  id: string;
  code: string;
  name: string;
  description: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Instance {
  id: string;
  activity_id: string;
  data: Record<string, any>;
  status: string | null;
  version: number;
  updated_at: string;
  created_at: string;
}

// ── Profils utilisateurs (pour la liste déroulante acteur) ────
export interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

export const useActivities = () =>
  useQuery({
    queryKey: ["activities"],
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Activity[];
    },
  });

export const useActivity = (id?: string) =>
  useQuery({
    queryKey: ["activity", id],
    enabled: !!id,
    queryFn: async (): Promise<Activity | null> => {
      const { data, error } = await supabase.from("activities").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Activity | null;
    },
  });

export const useAttributes = (activityId?: string) =>
  useQuery({
    queryKey: ["attributes", activityId],
    enabled: !!activityId,
    queryFn: async (): Promise<Attribute[]> => {
      const { data, error } = await supabase
        .from("attributes")
        .select("*")
        .eq("activity_id", activityId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((a: any) => ({ ...a, options: a.options ?? null })) as Attribute[];
    },
  });

export const useInstances = (activityId?: string) =>
  useQuery({
    queryKey: ["instances", activityId],
    enabled: !!activityId,
    queryFn: async (): Promise<Instance[]> => {
      const { data, error } = await supabase
        .from("instances")
        .select("*")
        .eq("activity_id", activityId!)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Instance[];
    },
  });

export const useProfiles = () =>
  useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    staleTime: 5 * 60 * 1000,
  });

export const useCreateActivity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { code: string; name: string; description?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("activities")
        .insert({ ...a, created_by: u.user?.id })
        .select()
        .single();
      if (error) throw error;
      await supabase.from("attributes").insert({
        activity_id: data.id,
        key: "statut",
        label: "Statut",
        type: "enum",
        options: ["Affecté", "En cours", "Réalisé", "Bloqué"],
        position: 999,
        is_status: true,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activities"] }),
  });
};

export const useDeleteActivity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activities"] }),
  });
};

export const useCloneActivity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ source_id, code, name, copy_data }: { source_id: string; code: string; name: string; copy_data: boolean }) => {
      const { data: src, error: e1 } = await supabase.from("activities").select("description").eq("id", source_id).single();
      if (e1) throw e1;
      const { data: u } = await supabase.auth.getUser();
      const { data: dst, error: e2 } = await supabase
        .from("activities")
        .insert({ code, name, description: src.description, created_by: u.user?.id })
        .select().single();
      if (e2) throw e2;
      const { data: attrs } = await supabase.from("attributes").select("*").eq("activity_id", source_id);
      if (attrs?.length) {
        await supabase.from("attributes").insert(
          attrs.map(({ id, activity_id, created_at, ...rest }: any) => ({ ...rest, activity_id: dst.id }))
        );
      }
      if (copy_data) {
        const { data: rows } = await supabase.from("instances").select("data,status").eq("activity_id", source_id).limit(5000);
        if (rows?.length) {
          await supabase.from("instances").insert(rows.map((r: any) => ({ ...r, activity_id: dst.id, created_by: u.user?.id })));
        }
      }
      return dst;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activities"] }),
  });
};