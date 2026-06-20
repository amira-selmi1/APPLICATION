import { useState } from "react";
import { Plus, Trash2, Loader2, Pencil, Check, X, Link2, Unlink } from "lucide-react";
import type { AttributeType, Attribute } from "@/hooks/useActivities";
import { useCreateAttribute, useDeleteAttribute, useUpdateAttribute } from "@/hooks/useTableMutations";
import { useLookupTools } from "@/hooks/useLookupTools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";

const TYPES: { value: AttributeType; label: string }[] = [
  { value: "text", label: "Texte" },
  { value: "number", label: "Nombre" },
  { value: "date", label: "Date" },
  { value: "enum", label: "Liste déroulante" },
  { value: "boolean", label: "Booléen (oui/non)" },
];

interface Props {
  activityId: string;
  attributes: Attribute[];
  canEdit: boolean;
}

export const AttributeManager = ({ activityId, attributes, canEdit }: Props) => {
  const [openAdd, setOpenAdd] = useState(false);
  const [type, setType] = useState<AttributeType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [lookupAttr, setLookupAttr] = useState<Attribute | null>(null);
  const createMut = useCreateAttribute(activityId);
  const updateMut = useUpdateAttribute(activityId);
  const deleteMut = useDeleteAttribute(activityId);
  const { data: lookupTools = [] } = useLookupTools(activityId);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const label = (fd.get("label") as string).trim();
    if (!label) return toast.error("Libellé requis");
    const key = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (attributes.some((a) => a.key === key)) return toast.error("Une colonne avec ce nom existe déjà");
    let options: string[] | null = null;
    if (type === "enum") {
      options = optionsText.split(",").map((s) => s.trim()).filter(Boolean);
      if (options.length < 1) return toast.error("Indiquez au moins une option");
    }
    try {
      await createMut.mutateAsync({
        key, label, type, options,
        position: (attributes[attributes.length - 1]?.position ?? 0) + 1,
      });
      toast.success("Colonne ajoutée");
      setOpenAdd(false);
      setOptionsText("");
      setType("text");
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-2 h-4 w-4" /> Colonnes
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Colonnes de l'activité</SheetTitle>
          <SheetDescription>Gérez les attributs dynamiques de cette activité.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          {attributes.map((a) => {
            const isEditing = editingId === a.id;
            const saveLabel = async () => {
              const lbl = editLabel.trim();
              if (!lbl) return toast.error("Libellé requis");
              try {
                await updateMut.mutateAsync({ id: a.id, label: lbl });
                toast.success("Libellé mis à jour");
                setEditingId(null);
              } catch (e: any) { toast.error(e.message); }
            };
            return (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <Input
                      autoFocus
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); saveLabel(); }
                        if (e.key === "Escape") { setEditingId(null); }
                      }}
                      className="h-8"
                    />
                  ) : (
                    <p className="font-medium truncate">
                      {a.label}
                      {a.is_status && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">STATUT</span>}
                      {a.lookup_tool_id && <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400"><Link2 className="h-2.5 w-2.5" />AUTO</span>}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground font-mono truncate">{a.key} · {a.type}</p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <Button size="icon" variant="ghost" onClick={saveLabel} disabled={updateMut.isPending}>
                          <Check className="h-4 w-4 text-primary" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        {!a.is_status && lookupTools.length > 0 && (
                          <Button
                            size="icon" variant="ghost" title="Remplir automatiquement depuis un outil"
                            onClick={() => setLookupAttr(a)}
                          >
                            {a.lookup_tool_id
                              ? <Link2 className="h-4 w-4 text-blue-500" />
                              : <Link2 className="h-4 w-4 text-muted-foreground/60" />}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => { setEditingId(a.id); setEditLabel(a.label); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {!a.is_status && !isEditing && (
                      <Button
                        size="icon" variant="ghost"
                        onClick={async () => {
                          if (!confirm(`Supprimer la colonne "${a.label}" ? Les données dans cette colonne resteront stockées mais ne seront plus visibles.`)) return;
                          try { await deleteMut.mutateAsync(a.id); toast.success("Supprimée"); }
                          catch (e: any) { toast.error(e.message); }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {canEdit && (
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button className="mt-6 w-full"><Plus className="mr-2 h-4 w-4" /> Ajouter une colonne</Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAdd}>
                <DialogHeader>
                  <DialogTitle>Ajouter une colonne</DialogTitle>
                  <DialogDescription>Cette colonne sera ajoutée immédiatement.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="att-label">Libellé</Label>
                    <Input id="att-label" name="label" placeholder="Référence chantier" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={type} onValueChange={(v) => setType(v as AttributeType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {type === "enum" && (
                    <div className="space-y-2">
                      <Label htmlFor="att-options">Options (séparées par virgules)</Label>
                      <Input id="att-options" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder="Option 1, Option 2, Option 3" />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMut.isPending}>
                    {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Ajouter
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {lookupAttr && (
          <LookupConfigDialog
            attribute={lookupAttr}
            attributes={attributes}
            tools={lookupTools}
            onClose={() => setLookupAttr(null)}
            onSave={async (patch) => {
              try {
                await updateMut.mutateAsync({ id: lookupAttr.id, ...patch });
                toast.success("Lien enregistré");
                setLookupAttr(null);
              } catch (e: any) { toast.error(e.message); }
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};

// ─────────────────────────────────────────────────────────────────
const LookupConfigDialog = ({
  attribute, attributes, tools, onSave, onClose,
}: {
  attribute: Attribute;
  attributes: Attribute[];
  tools: { id: string; name: string; key_column: string; columns: { key: string; label: string }[] }[];
  onSave: (patch: { lookup_tool_id: string | null; lookup_source_attr: string | null; lookup_column: string | null }) => Promise<void>;
  onClose: () => void;
}) => {
  const [toolId, setToolId] = useState<string>(attribute.lookup_tool_id ?? "");
  const [sourceAttr, setSourceAttr] = useState<string>(attribute.lookup_source_attr ?? "");
  const [column, setColumn] = useState<string>(attribute.lookup_column ?? "");
  const tool = tools.find((t) => t.id === toolId);

  const submit = () => {
    if (!toolId) return onSave({ lookup_tool_id: null, lookup_source_attr: null, lookup_column: null });
    if (!sourceAttr || !column) return;
    onSave({ lookup_tool_id: toolId, lookup_source_attr: sourceAttr, lookup_column: column });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remplir « {attribute.label} » automatiquement</DialogTitle>
          <DialogDescription>
            Choisissez un outil de référence et indiquez quelle colonne de votre tableau sert de clé.
            La valeur sera lue automatiquement quand l'utilisateur saisira la clé.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Outil de référence</Label>
            <Select value={toolId || "__none__"} onValueChange={(v) => { setToolId(v === "__none__" ? "" : v); setColumn(""); }}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Désactiver le lookup —</SelectItem>
                {tools.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {tool && (
            <>
              <div className="space-y-2">
                <Label>Colonne du tableau qui sert de clé (ex : la colonne PM)</Label>
                <Select value={sourceAttr} onValueChange={setSourceAttr}>
                  <SelectTrigger><SelectValue placeholder="Choisir une colonne…" /></SelectTrigger>
                  <SelectContent>
                    {attributes.filter((a) => a.id !== attribute.id && !a.is_status).map((a) => (
                      <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Cette valeur sera comparée à <span className="font-mono">{tool.key_column}</span> dans l'outil.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Valeur à récupérer dans l'outil</Label>
                <Select value={column} onValueChange={setColumn}>
                  <SelectTrigger><SelectValue placeholder="Choisir une colonne de l'outil…" /></SelectTrigger>
                  <SelectContent>
                    {tool.columns.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          {attribute.lookup_tool_id && (
            <Button
              variant="outline"
              onClick={() => onSave({ lookup_tool_id: null, lookup_source_attr: null, lookup_column: null })}
            >
              <Unlink className="mr-2 h-4 w-4" /> Désactiver
            </Button>
          )}
          <Button onClick={submit} disabled={!!toolId && (!sourceAttr || !column)}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
