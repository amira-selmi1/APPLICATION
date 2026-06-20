-- Stop writing the old audit/history log on every cell edit
DROP TRIGGER IF EXISTS trg_audit_instances ON public.instances;
DROP TRIGGER IF EXISTS trg_audit_attributes ON public.attributes;
DROP TRIGGER IF EXISTS trg_audit_activities ON public.activities;

-- Make ACTEUR permission sync cheap for normal cell edits
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

  IF TG_OP = 'UPDATE'
     AND public.norm_actor_text(OLD.data ->> v_key) = public.norm_actor_text(NEW.data ->> v_key) THEN
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

REVOKE ALL ON FUNCTION public.grant_acteur_read() FROM PUBLIC, anon, authenticated;