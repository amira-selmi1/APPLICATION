CREATE OR REPLACE FUNCTION public.instance_assigned_to_user(_uid uuid, _activity_id uuid, _data jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
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

REVOKE ALL ON FUNCTION public.grant_acteur_read() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.instance_assigned_to_user(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instance_assigned_to_user(uuid, uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.norm_actor_text(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.norm_actor_text(text) TO authenticated;