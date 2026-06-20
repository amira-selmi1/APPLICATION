import { useEffect, useState } from "react";
import { Users, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfiles } from "@/hooks/useActivities";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Permission {
  user_id: string;
  can_read: boolean;
  can_write: boolean;
  can_admin: boolean;
}

interface Props {
  activityId: string;
}

export const ActivityConsultantsManager = ({ activityId }: Props) => {
  const [open, setOpen] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const { data: profiles = [] } = useProfiles();

  const fetchPermissions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("activity_permissions")
      .select("user_id, can_read, can_write, can_admin")
      .eq("activity_id", activityId);
    if (!error) setPermissions((data ?? []) as Permission[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchPermissions();
  }, [open, activityId]);

  const assignedUserIds = new Set(permissions.map((p) => p.user_id));
  const availableProfiles = profiles.filter((p) => !assignedUserIds.has(p.user_id));

  const handleAdd = async () => {
    if (!selectedUser) return;
    setSaving(selectedUser);
    const { error } = await supabase.from("activity_permissions").upsert({
      activity_id: activityId,
      user_id: selectedUser,
      can_read: true,
      can_write: false,
      can_admin: false,
    }, { onConflict: "activity_id,user_id" });
    if (error) { toast.error(error.message); }
    else { toast.success("Consultant ajouté"); setSelectedUser(""); await fetchPermissions(); }
    setSaving(null);
  };

  const handleToggle = async (userId: string, field: "can_read" | "can_write" | "can_admin", value: boolean) => {
    setSaving(userId);
    const { error } = await supabase
      .from("activity_permissions")
      .update({ [field]: value })
      .eq("activity_id", activityId)
      .eq("user_id", userId);
    if (error) { toast.error(error.message); }
    else {
      setPermissions((prev) =>
        prev.map((p) => p.user_id === userId ? { ...p, [field]: value } : p)
      );
    }
    setSaving(null);
  };

  const handleRemove = async (userId: string) => {
    setSaving(userId);
    const { error } = await supabase
      .from("activity_permissions")
      .delete()
      .eq("activity_id", activityId)
      .eq("user_id", userId);
    if (error) { toast.error(error.message); }
    else { toast.success("Accès retiré"); await fetchPermissions(); }
    setSaving(null);
  };

  const nameOf = (userId: string) => {
    const p = profiles.find((pr) => pr.user_id === userId);
    return p?.display_name || p?.email || userId;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="mr-2 h-4 w-4" /> Consultants
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gestion des consultants</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 pt-2">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Sélectionner un consultant…" />
            </SelectTrigger>
            <SelectContent>
              {availableProfiles.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {p.display_name || p.email || p.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!selectedUser || !!saving}>
            {saving === selectedUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        <div className="mt-4 space-y-1">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : permissions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Aucun consultant assigné.</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground px-1 pb-1">
                <span>Utilisateur</span>
                <span className="text-center">Lire</span>
                <span className="text-center">Écrire</span>
                <span className="text-center">Admin</span>
                <span />
              </div>
              {permissions.map((perm) => (
                <div key={perm.user_id} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 gap-y-1 rounded-md border border-border px-3 py-2">
                  <span className="truncate text-sm">{nameOf(perm.user_id)}</span>
                  {(["can_read", "can_write", "can_admin"] as const).map((field) => (
                    <div key={field} className="flex justify-center">
                      <Checkbox
                        id={`${perm.user_id}-${field}`}
                        checked={perm[field]}
                        disabled={!!saving}
                        onCheckedChange={(v) => handleToggle(perm.user_id, field, !!v)}
                      />
                      <Label htmlFor={`${perm.user_id}-${field}`} className="sr-only">{field}</Label>
                    </div>
                  ))}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    disabled={!!saving}
                    onClick={() => handleRemove(perm.user_id)}
                  >
                    {saving === perm.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
