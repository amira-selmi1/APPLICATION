-- Étend les droits des superviseurs sur les activités et les permissions

-- activities: INSERT
DROP POLICY IF EXISTS "activities_insert_admin" ON public.activities;
CREATE POLICY "activities_insert_admin" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superviseur')
  );

-- activities: DELETE
DROP POLICY IF EXISTS "activities_delete_admin" ON public.activities;
CREATE POLICY "activities_delete_admin" ON public.activities
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superviseur')
  );

-- activities: UPDATE (ajouter superviseur)
DROP POLICY IF EXISTS "activities_update_admin" ON public.activities;
CREATE POLICY "activities_update_admin" ON public.activities
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superviseur')
    OR public.can_admin_activity(auth.uid(), id)
  );

-- activity_permissions: SELECT (superviseur voit toutes les permissions)
DROP POLICY IF EXISTS "activity_perms_select" ON public.activity_permissions;
CREATE POLICY "activity_perms_select" ON public.activity_permissions
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superviseur')
  );

-- activity_permissions: ALL (superviseur gère les consultants)
DROP POLICY IF EXISTS "activity_perms_admin_all" ON public.activity_permissions;
CREATE POLICY "activity_perms_admin_all" ON public.activity_permissions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superviseur')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superviseur')
  );

-- user_roles: SELECT (superviseur voit tous les rôles pour la page Utilisateurs)
DROP POLICY IF EXISTS "user_roles_select_self_or_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superviseur')
  );
