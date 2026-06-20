import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const map: Record<string, { label: string; cls: string }> = {
  "Affecté":   { label: "Affecté",  cls: "bg-status-affecte/15 text-status-affecte border-status-affecte/30" },
  "Affecte":   { label: "Affecté",  cls: "bg-status-affecte/15 text-status-affecte border-status-affecte/30" },
  "En cours":  { label: "En cours", cls: "bg-status-encours/15 text-status-encours border-status-encours/30" },
  "Réalisé":   { label: "Réalisé",  cls: "bg-status-realise/15 text-status-realise border-status-realise/30" },
  "Realise":   { label: "Réalisé",  cls: "bg-status-realise/15 text-status-realise border-status-realise/30" },
  "Bloqué":    { label: "Bloqué",   cls: "bg-status-bloque/15 text-status-bloque border-status-bloque/30" },
  "Bloque":    { label: "Bloqué",   cls: "bg-status-bloque/15 text-status-bloque border-status-bloque/30" },
};

export const StatusBadge = ({ value }: { value?: string | null }) => {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const conf = map[value] ?? { label: value, cls: "bg-muted text-muted-foreground border-border" };
  return <Badge variant="outline" className={cn("font-medium", conf.cls)}>{conf.label}</Badge>;
};

export const STATUS_OPTIONS = ["Affecté", "En cours", "Réalisé", "Bloqué"];
