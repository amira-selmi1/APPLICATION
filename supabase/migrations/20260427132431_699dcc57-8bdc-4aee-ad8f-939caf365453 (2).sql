-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'superviseur', 'operateur');
CREATE TYPE public.attribute_type AS ENUM ('text', 'number', 'date', 'enum', 'boolean');

-- =========================================================
-- HELPER : update_updated_at
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- USER ROLES
-- =========================================================
CREATE TABLE public.user_roles (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role     app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- ACTIVITIES
-- =========================================================
CREATE TABLE public.activities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  archived     BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_activities_updated BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- ACTIVITY PERMISSIONS
-- =========================================================
CREATE TABLE public.activity_permissions (
  activity_id  UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_read     BOOLEAN NOT NULL DEFAULT true,
  can_write    BOOLEAN NOT NULL DEFAULT false,
  can_admin    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);
ALTER TABLE public.activity_permissions ENABLE ROW LEVEL SECURITY;

-- helpers (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.can_read_activity(_uid UUID, _aid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin')
      OR EXISTS(SELECT 1 FROM public.activity_permissions
                WHERE user_id=_uid AND activity_id=_aid AND can_read);
$$;

CREATE OR REPLACE FUNCTION public.can_write_activity(_uid UUID, _aid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin')
      OR EXISTS(SELECT 1 FROM public.activity_permissions
                WHERE user_id=_uid AND activity_id=_aid AND can_write);
$$;

CREATE OR REPLACE FUNCTION public.can_admin_activity(_uid UUID, _aid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin')
      OR EXISTS(SELECT 1 FROM public.activity_permissions
                WHERE user_id=_uid AND activity_id=_aid AND can_admin);
$$;

-- Activities policies
CREATE POLICY "activities_select" ON public.activities
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'superviseur')
      OR public.can_read_activity(auth.uid(), id));
CREATE POLICY "activities_insert_admin" ON public.activities
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "activities_update_admin" ON public.activities
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.can_admin_activity(auth.uid(), id));
CREATE POLICY "activities_delete_admin" ON public.activities
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Activity permissions policies
CREATE POLICY "activity_perms_select" ON public.activity_permissions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "activity_perms_admin_all" ON public.activity_permissions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- ATTRIBUTES (colonnes dynamiques)
-- =========================================================
CREATE TABLE public.attributes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id   UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  type          attribute_type NOT NULL,
  required      BOOLEAN NOT NULL DEFAULT false,
  options       JSONB,
  validation    JSONB,
  position      INTEGER NOT NULL DEFAULT 0,
  is_status     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(activity_id, key)
);
CREATE UNIQUE INDEX one_status_per_activity
  ON public.attributes(activity_id) WHERE is_status = true;

ALTER TABLE public.attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attributes_select" ON public.attributes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'superviseur')
      OR public.can_read_activity(auth.uid(), activity_id));
CREATE POLICY "attributes_insert" ON public.attributes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.can_admin_activity(auth.uid(), activity_id));
CREATE POLICY "attributes_update" ON public.attributes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.can_admin_activity(auth.uid(), activity_id));
CREATE POLICY "attributes_delete" ON public.attributes
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.can_admin_activity(auth.uid(), activity_id));

-- =========================================================
-- INSTANCES (lignes dynamiques)
-- =========================================================
CREATE TABLE public.instances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id   UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  created_by    UUID REFERENCES auth.users(id),
  updated_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_instances_activity ON public.instances(activity_id);
CREATE INDEX idx_instances_status   ON public.instances(activity_id, status);
CREATE INDEX idx_instances_data_gin ON public.instances USING GIN (data jsonb_path_ops);
CREATE INDEX idx_instances_updated  ON public.instances(activity_id, updated_at DESC);

ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "instances_select" ON public.instances
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'superviseur')
      OR public.can_read_activity(auth.uid(), activity_id));
CREATE POLICY "instances_insert" ON public.instances
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.can_write_activity(auth.uid(), activity_id));
CREATE POLICY "instances_update" ON public.instances
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.can_write_activity(auth.uid(), activity_id));
CREATE POLICY "instances_delete" ON public.instances
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.can_write_activity(auth.uid(), activity_id));

CREATE TRIGGER trg_instances_updated BEFORE UPDATE ON public.instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sync status column from JSONB based on is_status attribute
CREATE OR REPLACE FUNCTION public.sync_instance_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  status_key TEXT;
BEGIN
  SELECT key INTO status_key
  FROM public.attributes
  WHERE activity_id = NEW.activity_id AND is_status = true
  LIMIT 1;

  IF status_key IS NOT NULL THEN
    NEW.status := NEW.data ->> status_key;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_instances_sync_status
  BEFORE INSERT OR UPDATE OF data ON public.instances
  FOR EACH ROW EXECUTE FUNCTION public.sync_instance_status();

-- =========================================================
-- AUDIT LOG
-- =========================================================
CREATE TABLE public.audit_log (
  id            BIGSERIAL PRIMARY KEY,
  table_name    TEXT NOT NULL,
  record_id     TEXT NOT NULL,
  activity_id   UUID,
  action        TEXT NOT NULL,
  changed_by    UUID,
  changes       JSONB,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_record   ON public.audit_log(table_name, record_id);
CREATE INDEX idx_audit_activity ON public.audit_log(activity_id, occurred_at DESC);
CREATE INDEX idx_audit_user     ON public.audit_log(changed_by, occurred_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_admin_superviseur_read" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'superviseur')
      OR (activity_id IS NOT NULL AND public.can_read_activity(auth.uid(), activity_id)));

CREATE OR REPLACE FUNCTION public.fn_audit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_aid UUID;
  v_rid TEXT;
BEGIN
  IF TG_TABLE_NAME = 'activities' THEN
    v_aid := COALESCE(NEW.id, OLD.id);
  ELSE
    v_aid := COALESCE(NEW.activity_id, OLD.activity_id);
  END IF;
  v_rid := COALESCE(NEW.id::text, OLD.id::text);

  INSERT INTO public.audit_log(table_name, record_id, activity_id, action, changed_by, changes)
  VALUES (
    TG_TABLE_NAME,
    v_rid,
    v_aid,
    TG_OP,
    auth.uid(),
    CASE TG_OP
      WHEN 'UPDATE' THEN jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
      WHEN 'INSERT' THEN to_jsonb(NEW)
      ELSE to_jsonb(OLD)
    END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_activities
  AFTER INSERT OR UPDATE OR DELETE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit();
CREATE TRIGGER trg_audit_attributes
  AFTER INSERT OR UPDATE OR DELETE ON public.attributes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit();
CREATE TRIGGER trg_audit_instances
  AFTER INSERT OR UPDATE OR DELETE ON public.instances
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit();

-- =========================================================
-- AUTO-CREATE PROFILE + first user becomes admin
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email,'@',1)));

  SELECT COUNT(*) INTO v_count FROM public.user_roles;
  IF v_count = 0 THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'operateur');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- REALTIME
-- =========================================================
ALTER TABLE public.instances REPLICA IDENTITY FULL;
ALTER TABLE public.attributes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attributes;