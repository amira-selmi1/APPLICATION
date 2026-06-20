import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type Role = "admin" | "superviseur" | "operateur";

const Users = () => {
  const { user: me, isAdmin, isSuperviseur } = useAuth();
  const qc = useQueryClient();
  const [updating, setUpdating] = useState<string | null>(null);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles-with-roles"],
    queryFn: async () => {
      const { data: ps, error: e1 } = await supabase.from("profiles").select("*").order("created_at");
      if (e1) throw e1;
      const { data: rs, error: e2 } = await supabase.from("user_roles").select("*");
      if (e2) throw e2;
      return (ps ?? []).map((p: any) => ({
        ...p,
        roles: (rs ?? []).filter((r: any) => r.user_id === p.user_id).map((r: any) => r.role) as Role[],
      }));
    },
  });

  const updateRole = async (userId: string, newRole: Role) => {
    setUpdating(userId);
    try {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
      if (error) throw error;
      toast.success("Rôle mis à jour");
      qc.invalidateQueries({ queryKey: ["profiles-with-roles"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setUpdating(null); }
  };

  if (!isAdmin && !isSuperviseur) {
    return (
      <div className="container mx-auto p-6">
        <Card><CardContent className="py-12 text-center text-muted-foreground">Accès réservé aux administrateurs et superviseurs.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in">
      <header>
        <h1 className="font-display text-3xl">Utilisateurs</h1>
        <p className="text-muted-foreground">Gérez les rôles globaux des utilisateurs.</p>
      </header>

      <Card className="gradient-card">
        <CardHeader><CardTitle className="font-display text-lg flex items-center gap-2"><UsersIcon className="h-5 w-5" /> Membres</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-2">
              {profiles.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.display_name ?? p.email} {p.user_id === me?.id && <Badge variant="outline" className="ml-2">vous</Badge>}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                  </div>
                  <Select
                    value={p.roles[0] ?? "operateur"}
                    onValueChange={(v) => updateRole(p.user_id, v as Role)}
                    disabled={!isAdmin || updating === p.user_id || p.user_id === me?.id}
                  >
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="superviseur">Superviseur</SelectItem>
                      <SelectItem value="operateur">Opérateur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Users;
