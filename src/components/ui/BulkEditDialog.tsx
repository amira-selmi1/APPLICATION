import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Attribute } from "@/hooks/useActivities";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  attributes: Attribute[];
  count: number;
  onApply: (key: string, value: any) => Promise<void>;
}

export const BulkEditDialog = ({ open, onOpenChange, attributes, count, onApply }: Props) => {
  const editable = attributes.filter((a) => !a.is_status || true); // tous éditables
  const [key, setKey] = useState<string>(editable[0]?.key ?? "");
  const [value, setValue] = useState<any>("");
  const [pending, setPending] = useState(false);
  const attr = attributes.find((a) => a.key === key);

  const handleApply = async () => {
    if (!attr) return;
    setPending(true);
    try {
      let v: any = value;
      if (attr.type === "number") v = value === "" || value === null ? null : Number(value);
      if (attr.type === "boolean") v = !!value;
      if (v === "" && attr.type !== "boolean") v = null;
      await onApply(key, v);
      onOpenChange(false);
      toast.success(`${count} ligne${count > 1 ? "s" : ""} mise${count > 1 ? "s" : ""} à jour`);
      setValue("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier en masse</DialogTitle>
          <DialogDescription>
            Appliquer une nouvelle valeur à <strong>{count}</strong> ligne{count > 1 ? "s" : ""} sélectionnée{count > 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Colonne</Label>
            <Select value={key} onValueChange={(v) => { setKey(v); setValue(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {editable.map((a) => (
                  <SelectItem key={a.key} value={a.key}>{a.label} <span className="text-muted-foreground ml-1">({a.type})</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {attr && (
            <div className="space-y-2">
              <Label>Nouvelle valeur</Label>
              {attr.type === "enum" ? (
                <Select value={value || ""} onValueChange={setValue}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__">— vide —</SelectItem>
                    {(attr.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : attr.type === "boolean" ? (
                <div className="flex items-center gap-2 rounded-md border border-border p-2">
                  <Checkbox checked={!!value} onCheckedChange={(c) => setValue(!!c)} id="bulk-bool" />
                  <Label htmlFor="bulk-bool" className="font-normal cursor-pointer">{value ? "Oui" : "Non"}</Label>
                </div>
              ) : (
                <Input
                  type={attr.type === "number" ? "number" : attr.type === "date" ? "date" : "text"}
                  value={value ?? ""}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="(laisser vide pour effacer)"
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleApply} disabled={pending || !attr}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Appliquer à {count} ligne{count > 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
