import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivities } from "@/hooks/useActivities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Activity as ActivityIcon, CheckCircle2, Clock, AlertOctagon, ArrowRight,
  Loader2, Download, TrendingUp, Users,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { startOfDay, subDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  "Affecté": "hsl(217 91% 50%)",
  "En cours": "hsl(38 92% 50%)",
  "Réalisé": "hsl(142 71% 38%)",
  "Bloqué": "hsl(0 75% 50%)",
};

type Period = "7" | "30" | "90" | "all";

const Dashboard = () => {
  const [period, setPeriod] = useState<Period>("30");
  const [activityFilter, setActivityFilter] = useState<string>("__all__");
  const exportRef = useRef<HTMLDivElement>(null);

  const { data: activities = [] } = useActivities();

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["dashboard-instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instances")
        .select("id,activity_id,status,updated_at,created_at,updated_by")
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["dashboard-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id,display_name,email");
      if (error) throw error;
      return data ?? [];
    },
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p: any) => m.set(p.user_id, p.display_name || p.email || "—"));
    return m;
  }, [profiles]);

  const since = useMemo(() => {
    if (period === "all") return new Date(0);
    return subDays(startOfDay(new Date()), Number(period));
  }, [period]);

  const filteredInstances = useMemo(() => {
    return instances.filter((i: any) => {
      if (activityFilter !== "__all__" && i.activity_id !== activityFilter) return false;
      return true;
    });
  }, [instances, activityFilter]);

  const stats = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    const sinceMs = since.getTime();
    const total = filteredInstances.length;
    const realised = filteredInstances.filter((i: any) => i.status === "Réalisé").length;
    const realisedToday = filteredInstances.filter((i: any) => i.status === "Réalisé" && new Date(i.updated_at).getTime() >= today).length;
    const realisedPeriod = filteredInstances.filter((i: any) => i.status === "Réalisé" && new Date(i.updated_at).getTime() >= sinceMs).length;
    const inProgress = filteredInstances.filter((i: any) => i.status === "En cours").length;
    const blocked = filteredInstances.filter((i: any) => i.status === "Bloqué").length;
    const completionRate = total > 0 ? Math.round((realised / total) * 100) : 0;

    // Pie status
    const byStatus: Record<string, number> = {};
    filteredInstances.forEach((i: any) => {
      const s = i.status ?? "Sans statut";
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    });
    const pieData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

    // Avancement par activité
    const byActivity: Record<string, { name: string; total: number; realise: number; encours: number; bloque: number; rate: number }> = {};
    activities.forEach((a) => {
      byActivity[a.id] = { name: a.code || a.name, total: 0, realise: 0, encours: 0, bloque: 0, rate: 0 };
    });
    filteredInstances.forEach((i: any) => {
      const b = byActivity[i.activity_id];
      if (!b) return;
      b.total++;
      if (i.status === "Réalisé") b.realise++;
      else if (i.status === "En cours") b.encours++;
      else if (i.status === "Bloqué") b.bloque++;
    });
    const activityData = Object.values(byActivity)
      .filter((b) => b.total > 0)
      .map((b) => ({ ...b, rate: Math.round((b.realise / b.total) * 100) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Productivité par membre (basée sur updated_at dans la période + status Réalisé)
    const byUser: Record<string, { name: string; realise: number; modifications: number }> = {};
    filteredInstances.forEach((i: any) => {
      if (!i.updated_by) return;
      const updated = new Date(i.updated_at).getTime();
      if (updated < sinceMs) return;
      const name = profileMap.get(i.updated_by) ?? "—";
      if (!byUser[i.updated_by]) byUser[i.updated_by] = { name, realise: 0, modifications: 0 };
      byUser[i.updated_by].modifications++;
      if (i.status === "Réalisé") byUser[i.updated_by].realise++;
    });
    const userData = Object.values(byUser)
      .sort((a, b) => b.realise - a.realise)
      .slice(0, 10);

    // Tendance jour par jour (Réalisés)
    const days = period === "all" ? 30 : Math.min(Number(period), 90);
    const trend: { date: string; realise: number; modifs: number }[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const day = startOfDay(subDays(new Date(), d));
      const next = startOfDay(subDays(new Date(), d - 1));
      const dayMs = day.getTime();
      const nextMs = next.getTime();
      let realise = 0, modifs = 0;
      filteredInstances.forEach((i: any) => {
        const t = new Date(i.updated_at).getTime();
        if (t >= dayMs && t < nextMs) {
          modifs++;
          if (i.status === "Réalisé") realise++;
        }
      });
      trend.push({ date: format(day, "dd/MM", { locale: fr }), realise, modifs });
    }

    return {
      total, realised, realisedToday, realisedPeriod, inProgress, blocked,
      completionRate, pieData, activityData, userData, trend,
    };
  }, [filteredInstances, activities, since, period, profileMap]);

  const kpiCards = [
    { label: "Tâches totales", value: stats.total, icon: ActivityIcon, color: "text-primary", bg: "bg-primary/10" },
    { label: "Avancement global", value: `${stats.completionRate}%`, icon: TrendingUp, color: "text-status-realise", bg: "bg-status-realise/10" },
    { label: `Réalisées (${period === "all" ? "tout" : period + "j"})`, value: stats.realisedPeriod, icon: CheckCircle2, color: "text-status-realise", bg: "bg-status-realise/10" },
    { label: "En cours", value: stats.inProgress, icon: Clock, color: "text-status-encours", bg: "bg-status-encours/10" },
    { label: "Bloquées", value: stats.blocked, icon: AlertOctagon, color: "text-status-bloque", bg: "bg-status-bloque/10" },
  ];

  const handleExportPDF = async () => {
    if (!exportRef.current) return;
    toast.loading("Génération du PDF…", { id: "pdf" });
    try {
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(img, "PNG", 0, 0, pdfW, pdfH);
      pdf.save(`dashboard-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("PDF exporté", { id: "pdf" });
    } catch (e: any) {
      toast.error("Erreur export : " + e.message, { id: "pdf" });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Tableau de bord</h1>
          <p className="text-muted-foreground">Vue temps réel des activités opérationnelles télécom.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={activityFilter} onValueChange={setActivityFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toutes les activités</SelectItem>
              {activities.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 jours</SelectItem>
              <SelectItem value="30">30 jours</SelectItem>
              <SelectItem value="90">90 jours</SelectItem>
              <SelectItem value="all">Tout</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <Download className="mr-1 h-4 w-4" /> PDF
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div ref={exportRef} className="space-y-6 bg-background p-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {kpiCards.map((k) => (
              <Card key={k.label} className="gradient-card transition-all hover:shadow-soft hover:-translate-y-0.5">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`rounded-xl ${k.bg} p-2.5`}>
                    <k.icon className={`h-4.5 w-4.5 ${k.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{k.label}</p>
                    <p className="font-display text-xl font-bold">{k.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="gradient-card lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">Tendance d'activité</CardTitle>
                <p className="text-xs text-muted-foreground">Modifications & réalisations sur la période</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={stats.trend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="modifs" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Modifs" />
                    <Line type="monotone" dataKey="realise" stroke="hsl(var(--status-realise))" strokeWidth={2} dot={false} name="Réalisées" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="gradient-card">
              <CardHeader className="pb-2"><CardTitle className="font-display text-base">Répartition statuts</CardTitle></CardHeader>
              <CardContent>
                {stats.pieData.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">—</p>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={stats.pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={3}>
                        {stats.pieData.map((d, i) => <Cell key={i} fill={STATUS_COLORS[d.name] ?? "hsl(var(--muted-foreground))"} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="gradient-card">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">Avancement par activité</CardTitle>
                <p className="text-xs text-muted-foreground">Top 10 — réalisé / en cours / bloqué</p>
              </CardHeader>
              <CardContent>
                {stats.activityData.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">Aucune donnée</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.activityData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="realise" stackId="a" fill="hsl(var(--status-realise))" name="Réalisé" />
                      <Bar dataKey="encours" stackId="a" fill="hsl(var(--status-encours))" name="En cours" />
                      <Bar dataKey="bloque" stackId="a" fill="hsl(var(--status-bloque))" name="Bloqué" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="gradient-card">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Productivité par membre
                </CardTitle>
                <p className="text-xs text-muted-foreground">Modifications & réalisations sur la période</p>
              </CardHeader>
              <CardContent>
                {stats.userData.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">Aucune activité enregistrée</p>
                ) : (
                  <div className="space-y-2">
                    {stats.userData.map((u, i) => {
                      const maxR = Math.max(...stats.userData.map((x) => x.modifications), 1);
                      const pct = (u.modifications / maxR) * 100;
                      return (
                        <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-card/50 p-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-sm text-primary">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium truncate">{u.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {u.realise}<span className="text-muted-foreground/50"> / {u.modifications}</span>
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="gradient-card">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="font-display text-base">Mes activités</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link to="/activities">Toutes <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {activities.slice(0, 6).map((a) => (
                <Link key={a.id} to={`/activities/${a.id}`}
                  className="rounded-md border border-border bg-card p-3 transition-all hover:border-primary hover:bg-primary/5 hover:shadow-soft">
                  <p className="font-medium truncate">{a.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{a.code}</p>
                </Link>
              ))}
              {activities.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Aucune activité.</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
