
-- Function: when an instance's ACTEUR field is set, grant can_read to the matching user
CREATE OR REPLACE FUNCTION public.grant_acteur_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_acteur text;
  v_uid uuid;
BEGIN
  SELECT key INTO v_key FROM public.attributes
  WHERE activity_id = NEW.activity_id AND lower(key) = 'acteur'
  LIMIT 1;
  IF v_key IS NULL THEN RETURN NEW; END IF;

  v_acteur := NEW.data ->> v_key;
  IF v_acteur IS NULL OR btrim(v_acteur) = '' THEN RETURN NEW; END IF;

  SELECT user_id INTO v_uid FROM public.profiles
  WHERE lower(display_name) = lower(btrim(v_acteur))
     OR lower(email) = lower(btrim(v_acteur))
     OR lower(split_part(email, '@', 1)) = lower(btrim(v_acteur))
  LIMIT 1;
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.activity_permissions(user_id, activity_id, can_read, can_write, can_admin)
  VALUES (v_uid, NEW.activity_id, true, false, false)
  ON CONFLICT (activity_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_acteur_read ON public.instances;
CREATE TRIGGER trg_grant_acteur_read
AFTER INSERT OR UPDATE OF data ON public.instances
FOR EACH ROW EXECUTE FUNCTION public.grant_acteur_read();

-- Backfill existing assignments
DO $$
DECLARE r record; v_key text; v_acteur text; v_uid uuid;
BEGIN
  FOR r IN SELECT id, activity_id, data FROM public.instances LOOP
    SELECT key INTO v_key FROM public.attributes
    WHERE activity_id = r.activity_id AND lower(key) = 'acteur' LIMIT 1;
    IF v_key IS NULL THEN CONTINUE; END IF;
    v_acteur := r.data ->> v_key;
    IF v_acteur IS NULL OR btrim(v_acteur) = '' THEN CONTINUE; END IF;
    SELECT user_id INTO v_uid FROM public.profiles
    WHERE lower(display_name) = lower(btrim(v_acteur))
       OR lower(email) = lower(btrim(v_acteur))
       OR lower(split_part(email, '@', 1)) = lower(btrim(v_acteur))
    LIMIT 1;
    IF v_uid IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.activity_permissions(user_id, activity_id, can_read, can_write, can_admin)
    VALUES (v_uid, r.activity_id, true, false, false)
    ON CONFLICT (activity_id, user_id) DO NOTHING;
  END LOOP;
END $$;
