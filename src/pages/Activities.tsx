import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Copy, Trash2, Table2, Search, Loader2 } from "lucide-react";
import { useActivities, useCreateActivity, useDeleteActivity, useCloneActivity, type Activity } from "@/hooks/useActivities";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const ActivitiesPage = () => {
  const { isAdmin, isSuperviseur } = useAuth();
  const canManage = isAdmin || isSuperviseur;
  const { data: activities = [], isLoading } = useActivities();
  const createMut = useCreateActivity();
  const deleteMut = useDeleteActivity();
  const cloneMut = useCloneActivity();
  const [search, setSearch] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [cloneFrom, setCloneFrom] = useState<Activity | null>(null);

  const filtered = activities.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.code.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = (fd.get("code") as string).trim().toUpperCase().replace(/\s+/g, "_");
    const name = (fd.get("name") as string).trim();
    const description = (fd.get("description") as string)?.trim() || undefined;
    if (!code || !name) return toast.error("Code et nom requis");
    try {
      await createMut.mutateAsync({ code, name, description });
      toast.success("Activité créée");
      setOpenCreate(false);
    } catch (err: any) {
      toast.error(err.message ?? "Erreur");
    }
  };

  const handleClone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cloneFrom) return;
    const fd = new FormData(e.currentTarget);
    const code = (fd.get("code") as string).trim().toUpperCase().replace(/\s+/g, "_");
    const name = (fd.get("name") as string).trim();
    const copy_data = fd.get("copy_data") === "on";
    try {
      await cloneMut.mutateAsync({ source_id: cloneFrom.id, code, name, copy_data });
      toast.success("Activité clonée");
      setCloneFrom(null);
    } catch (err: any) {
      toast.error(err.message ?? "Erreur");
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Activités</h1>
          <p className="text-muted-foreground">Chaque activité représente un tableau de suivi indépendant.</p>
        </div>
        {canManage && (
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground shadow-soft">
                <Plus className="mr-2 h-4 w-4" /> Nouvelle activité
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Créer une activité</DialogTitle>
                  <DialogDescription>Une colonne « Statut » sera ajoutée par défaut.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code (technique)</Label>
                    <Input id="code" name="code" placeholder="PM_RAF" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nom</Label>
                    <Input id="name" name="name" placeholder="PM RAF" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optionnel)</Label>
                    <Textarea id="description" name="description" rows={2} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMut.isPending}>
                    {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Créer
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </header>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-9" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card className="gradient-card border-dashed">
          <CardContent className="py-16 text-center">
            <Table2 className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Aucune activité</p>
            <p className="text-sm text-muted-foreground">{canManage ? "Créez votre première activité pour commencer." : "Aucune activité ne vous est accessible."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <Card key={a.id} className="gradient-card transition-all hover:shadow-elegant hover:-translate-y-0.5">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate font-display">{a.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">{a.code}</CardDescription>
                  </div>
                  <Table2 className="h-5 w-5 shrink-0 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {a.description && <p className="text-sm text-muted-foreground line-clamp-2">{a.description}</p>}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button asChild size="sm" variant="default">
                    <Link to={`/activities/${a.id}`}>Ouvrir</Link>
                  </Button>
                  {canManage && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setCloneFrom(a)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer « {a.name} » ?</AlertDialogTitle>
                            <AlertDialogDescription>Toutes les colonnes et lignes seront supprimées définitivement.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={async () => {
                                try { await deleteMut.mutateAsync(a.id); toast.success("Supprimée"); }
                                catch (e: any) { toast.error(e.message); }
                              }}
                            >Supprimer</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!cloneFrom} onOpenChange={(o) => !o && setCloneFrom(null)}>
        <DialogContent>
          <form onSubmit={handleClone}>
            <DialogHeader>
              <DialogTitle>Cloner « {cloneFrom?.name} »</DialogTitle>
              <DialogDescription>Le schéma (colonnes) sera dupliqué. Vous pouvez aussi copier les lignes.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cl-code">Nouveau code</Label>
                <Input id="cl-code" name="code" defaultValue={`${cloneFrom?.code}_COPY`} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cl-name">Nouveau nom</Label>
                <Input id="cl-name" name="name" defaultValue={`${cloneFrom?.name} (copie)`} required />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="cl-data" name="copy_data" />
                <Label htmlFor="cl-data" className="font-normal cursor-pointer">Copier également les lignes</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={cloneMut.isPending}>
                {cloneMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cloner
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ActivitiesPage;