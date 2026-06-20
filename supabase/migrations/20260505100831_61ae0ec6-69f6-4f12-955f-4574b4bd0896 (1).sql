
-- Outils de référence par activité (ex: Info PM, Catalogue câbles…)
CREATE TABLE public.lookup_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  key_column TEXT NOT NULL,                 -- nom logique de la colonne clé (ex: "pm")
  columns JSONB NOT NULL DEFAULT '[]'::jsonb, -- liste ordonnée des colonnes [{key,label}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX idx_lookup_tools_activity ON public.lookup_tools(activity_id);

ALTER TABLE public.lookup_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY lookup_tools_select ON public.lookup_tools FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'superviseur')
  OR can_read_activity(auth.uid(), activity_id)
);

CREATE POLICY lookup_tools_insert ON public.lookup_tools FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR can_admin_activity(auth.uid(), activity_id));

CREATE POLICY lookup_tools_update ON public.lookup_tools FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR can_admin_activity(auth.uid(), activity_id));

CREATE POLICY lookup_tools_delete ON public.lookup_tools FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin') OR can_admin_activity(auth.uid(), activity_id));

CREATE TRIGGER trg_lookup_tools_updated
BEFORE UPDATE ON public.lookup_tools
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lignes de chaque outil
CREATE TABLE public.lookup_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES public.lookup_tools(id) ON DELETE CASCADE,
  key_value TEXT NOT NULL,           -- valeur de la clé pour matching rapide
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lookup_rows_tool ON public.lookup_rows(tool_id);
CREATE INDEX idx_lookup_rows_key ON public.lookup_rows(tool_id, lower(key_value));

ALTER TABLE public.lookup_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY lookup_rows_select ON public.lookup_rows FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.lookup_tools t
  WHERE t.id = lookup_rows.tool_id
    AND (has_role(auth.uid(),'admin')
      OR has_role(auth.uid(),'superviseur')
      OR can_read_activity(auth.uid(), t.activity_id))
));

CREATE POLICY lookup_rows_write ON public.lookup_rows FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.lookup_tools t
  WHERE t.id = lookup_rows.tool_id
    AND (has_role(auth.uid(),'admin') OR can_admin_activity(auth.uid(), t.activity_id))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.lookup_tools t
  WHERE t.id = lookup_rows.tool_id
    AND (has_role(auth.uid(),'admin') OR can_admin_activity(auth.uid(), t.activity_id))
));

-- Lien attribut -> outil de lookup (sur la table attributes)
ALTER TABLE public.attributes
  ADD COLUMN lookup_tool_id UUID REFERENCES public.lookup_tools(id) ON DELETE SET NULL,
  ADD COLUMN lookup_source_attr TEXT,   -- key de l'attribut qui sert de clé (ex: "pm")
  ADD COLUMN lookup_column TEXT;        -- nom de la colonne du tool à lire (ex: "cpl")
