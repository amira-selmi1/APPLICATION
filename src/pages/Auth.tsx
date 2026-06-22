import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const emailSchema = z.string().trim().email("Email invalide").max(255);
const passwordSchema = z.string().min(6, "Mot de passe trop court (min 6)").max(72);
const nameSchema = z.string().trim().min(1, "Nom requis").max(100);

const Auth = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;
    const e1 = emailSchema.safeParse(email);
    const e2 = passwordSchema.safeParse(password);
    if (!e1.success) return toast.error(e1.error.issues[0].message);
    if (!e2.success) return toast.error(e2.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Connecté");
    nav("/");
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;
    const e0 = nameSchema.safeParse(name);
    const e1 = emailSchema.safeParse(email);
    const e2 = passwordSchema.safeParse(password);
    if (!e0.success) return toast.error(e0.error.issues[0].message);
    if (!e1.success) return toast.error(e1.error.issues[0].message);
    if (!e2.success) return toast.error(e2.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: name },
      },
    });
    setLoading(false);
    if (error) {
      if (error.message.includes("already")) return toast.error("Cet email est déjà inscrit. Connectez-vous.");
      return toast.error(error.message);
    }
    toast.success("Compte créé. Vérifiez votre email pour confirmer.");
  };

  return (
    <div className="flex min-h-screen">
      {/* Panneau gauche — brand Mantu/Amaris */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 gradient-hero relative overflow-hidden">
        {/* Cercles décoratifs */}
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-[hsl(var(--primary)/0.12)] blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[hsl(var(--accent)/0.10)] blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary shadow-glow">
            <span className="text-[18px]">📡</span>
          </div>
          <span className="text-[18px] font-extrabold text-white tracking-wide">FTTH</span>
        </div>

        <div className="relative space-y-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[hsl(var(--primary-glow))] mb-3">
              Plateforme de suivi
            </p>
            <h1 className="text-4xl font-black text-white leading-tight">
              Pilotez vos<br />activités télécom<br />en temps réel.
            </h1>
          </div>
          <p className="text-[hsl(220_20%_70%)] text-[15px] leading-relaxed max-w-sm">
            Suivez, gérez et analysez toutes vos opérations terrain depuis une interface unifiée.
          </p>
          <div className="flex gap-8 pt-2">
            {[["100%", "Temps réel"], ["Multi-rôles", "Accès granulaire"], ["Sécurisé", "RLS Supabase"]].map(([val, lbl]) => (
              <div key={lbl}>
                <p className="text-white font-bold text-[15px]">{val}</p>
                <p className="text-[hsl(220_20%_55%)] text-[11px] mt-0.5">{lbl}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] text-[hsl(220_20%_40%)]">© 2026 FTTH — Mantu Group</p>
      </div>

      {/* Panneau droit — formulaire */}
      <div className="flex flex-1 flex-col items-center justify-center p-8 bg-background">
        <div className="w-full max-w-xl space-y-8">
          {/* Logo mobile */}
          <div className="flex lg:hidden items-center gap-2 justify-center mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary shadow-glow">
              <span className="text-[16px]">📡</span>
            </div>
            <span className="text-[17px] font-extrabold tracking-wide">FTTH</span>
          </div>

          <Card className="border-border shadow-soft">
            <CardHeader className="px-10 pt-10 pb-6">
              <CardTitle className="text-[26px] font-bold">Bienvenue</CardTitle>
              <CardDescription className="text-[14px] mt-1">Connectez-vous à votre espace de travail</CardDescription>
            </CardHeader>
            <CardContent className="px-10 pb-10">
              <Tabs defaultValue="login">
                <TabsList className="grid w-full grid-cols-2 mb-7 h-11">
                  <TabsTrigger value="login" className="text-[13px]">Connexion</TabsTrigger>
                  <TabsTrigger value="signup" className="text-[13px]">Créer un compte</TabsTrigger>
                </TabsList>
                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="login-email" className="text-[13px] font-medium">Adresse email</Label>
                      <Input id="login-email" name="email" type="email" required autoComplete="email" placeholder="vous@example.com" className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="login-pwd" className="text-[13px] font-medium">Mot de passe</Label>
                      <Input id="login-pwd" name="password" type="password" required autoComplete="current-password" placeholder="••••••••" className="h-10" />
                    </div>
                    <Button type="submit" className="w-full h-10 gradient-primary text-white font-semibold shadow-soft mt-2" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Se connecter
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="signup">
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="su-name" className="text-[13px] font-medium">Nom complet</Label>
                      <Input id="su-name" name="name" required autoComplete="name" placeholder="Jean Dupont" className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="su-email" className="text-[13px] font-medium">Adresse email</Label>
                      <Input id="su-email" name="email" type="email" required autoComplete="email" placeholder="vous@example.com" className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="su-pwd" className="text-[13px] font-medium">Mot de passe</Label>
                      <Input id="su-pwd" name="password" type="password" required autoComplete="new-password" minLength={6} placeholder="Min. 6 caractères" className="h-10" />
                    </div>
                    <Button type="submit" className="w-full h-10 gradient-primary text-white font-semibold shadow-soft mt-2" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Créer mon compte
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center pt-1">
                      Le premier utilisateur inscrit devient administrateur.
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Auth;
