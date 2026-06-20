-- Permet à tout utilisateur assigné à une activité (can_read)
-- de mettre à jour les instances — le filtre UI limite à date + statut.

DROP POLICY IF EXISTS "instances_update" ON public.instances;
CREATE POLICY "instances_update" ON public.instances
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superviseur')
    OR public.can_read_activity(auth.uid(), activity_id)
  );
