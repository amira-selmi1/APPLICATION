-- Normalize text for actor/user matching
CREATE OR REPLACE FUNCTION public.norm_actor_text(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(btrim(coalesce(_value, '')));
$$;

-- Check whether an instance row is assigned to a specific user via the ACTEUR attribute
CREATE OR REPLACE FUNCTION public.instance_assigned_to_user(_uid uuid, _activity_id uuid, _data jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH acteur_attr AS (
    SELECT key
    FROM public.attributes
    WHERE activity_id = _activity_id
      AND lower(key) = 'acteur'
    LIMIT 1
  ), actor_value AS (
    SELECT public.norm_actor_text(_data ->> key) AS value
    FROM acteur_attr
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p, actor_value av
    WHERE p.user_id = _uid
      AND av.value <> ''
      AND (
        public.norm_actor_text(p.display_name) = av.value
        OR public.norm_actor_text(p.email) = av.value
        OR public.norm_actor_text(split_part(coalesce(p.email, ''), '@', 1)) = av.value
      )
  );
$$;

-- Grant activity visibility to every matching consultant, not only the first profile found
CREATE OR REPLACE FUNCTION public.grant_acteur_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_acteur text;
BEGIN
  SELECT key INTO v_key
  FROM public.attributes
  WHERE activity_id = NEW.activity_id
    AND lower(key) = 'acteur'
  LIMIT 1;

  IF v_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_acteur := public.norm_actor_text(NEW.data ->> v_key);
  IF v_acteur = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.activity_permissions(user_id, activity_id, can_read, can_write, can_admin)
  SELECT p.user_id, NEW.activity_id, true, false, false
  FROM public.profiles p
  WHERE public.norm_actor_text(p.display_name) = v_acteur
     OR public.norm_actor_text(p.email) = v_acteur
     OR public.norm_actor_text(split_part(coalesce(p.email, ''), '@', 1)) = v_acteur
  ON CONFLICT (activity_id, user_id) DO UPDATE
    SET can_read = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_acteur_read ON public.instances;
CREATE TRIGGER trg_grant_acteur_read
AFTER INSERT OR UPDATE OF data ON public.instances
FOR EACH ROW
EXECUTE FUNCTION public.grant_acteur_read();

-- Backfill permissions for all existing ACTEUR assignments
INSERT INTO public.activity_permissions(user_id, activity_id, can_read, can_write, can_admin)
SELECT DISTINCT p.user_id, i.activity_id, true, false, false
FROM public.instances i
JOIN public.attributes a
  ON a.activity_id = i.activity_id
 AND lower(a.key) = 'acteur'
JOIN public.profiles p
  ON public.norm_actor_text(p.display_name) = public.norm_actor_text(i.data ->> a.key)
  OR public.norm_actor_text(p.email) = public.norm_actor_text(i.data ->> a.key)
  OR public.norm_actor_text(split_part(coalesce(p.email, ''), '@', 1)) = public.norm_actor_text(i.data ->> a.key)
WHERE public.norm_actor_text(i.data ->> a.key) <> ''
ON CONFLICT (activity_id, user_id) DO UPDATE
  SET can_read = true;

-- Consultants with activity visibility only see rows assigned to them via ACTEUR.
-- Admins, superviseurs, référentes and users with write rights keep full row visibility.
DROP POLICY IF EXISTS "instances_select" ON public.instances;
CREATE POLICY "instances_select" ON public.instances
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'superviseur'::app_role)
  OR public.can_admin_activity(auth.uid(), activity_id)
  OR public.can_write_activity(auth.uid(), activity_id)
  OR (
    public.can_read_activity(auth.uid(), activity_id)
    AND public.instance_assigned_to_user(auth.uid(), activity_id, data)
  )
);

-- Helpful indexes for permission and actor-access checks
CREATE INDEX IF NOT EXISTS idx_activity_permissions_user_activity
ON public.activity_permissions(user_id, activity_id);

CREATE INDEX IF NOT EXISTS idx_attributes_activity_lower_key
ON public.attributes(activity_id, lower(key));