-- =============================================================
-- SP Dental Care - Database Setup with Proper RLS
-- =============================================================

-- Doctors table (maps Supabase auth users to doctor profiles)
CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  specialties TEXT[] DEFAULT '{}',
  created TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- Patients table
CREATE TABLE IF NOT EXISTS public.patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dob DATE,
  gender TEXT,
  blood TEXT,
  phone TEXT UNIQUE,
  email TEXT,
  address TEXT,
  treatment TEXT,
  doctor TEXT,
  history TEXT,
  notes TEXT,
  created TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments table
CREATE TABLE IF NOT EXISTS public.appointments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  age INTEGER,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  service TEXT NOT NULL,
  doctor TEXT NOT NULL,
  status TEXT DEFAULT 'Pending',
  visittype TEXT,
  notes TEXT,
  created TIMESTAMPTZ DEFAULT NOW()
);

-- Orthodontics table
CREATE TABLE IF NOT EXISTS public.orthodontics (
  id TEXT PRIMARY KEY,
  pid TEXT REFERENCES public.patients(id),
  name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  phone TEXT,
  type TEXT NOT NULL,
  "start" DATE NOT NULL,
  "end" DATE,
  doctor TEXT NOT NULL,
  diag TEXT,
  plan TEXT,
  status TEXT DEFAULT 'Active',
  progress INTEGER DEFAULT 0,
  visits JSONB DEFAULT '[]'::jsonb,
  created TIMESTAMPTZ DEFAULT NOW()
);

-- OPG Reports table
CREATE TABLE IF NOT EXISTS public.opg_reports (
  id TEXT PRIMARY KEY,
  pid TEXT REFERENCES public.patients(id),
  ortho_id TEXT REFERENCES public.orthodontics(id),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  image TEXT,
  created TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- RLS Policies
-- =============================================================

-- Enable RLS on all tables
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orthodontics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opg_reports ENABLE ROW LEVEL SECURITY;

-- Patients: authenticated doctors can read all; write via app
CREATE POLICY "Doctors can view patients"
  ON public.patients FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Doctors can insert patients"
  ON public.patients FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Doctors can update patients"
  ON public.patients FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Doctors can delete patients"
  ON public.patients FOR DELETE
  USING (auth.role() = 'authenticated');

-- Appointments: authenticated can manage; anon can insert for booking
CREATE POLICY "Anyone can book appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Doctors can view appointments"
  ON public.appointments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Doctors can update appointments"
  ON public.appointments FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Doctors can delete appointments"
  ON public.appointments FOR DELETE
  USING (auth.role() = 'authenticated');

-- Orthodontics: authenticated only
CREATE POLICY "Doctors can view ortho cases"
  ON public.orthodontics FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Doctors can manage ortho cases"
  ON public.orthodontics FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Doctors can update ortho cases"
  ON public.orthodontics FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Doctors can delete ortho cases"
  ON public.orthodontics FOR DELETE
  USING (auth.role() = 'authenticated');

-- OPG Reports: authenticated only
CREATE POLICY "Doctors can view OPG reports"
  ON public.opg_reports FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Doctors can manage OPG reports"
  ON public.opg_reports FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Doctors can update OPG reports"
  ON public.opg_reports FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Doctors can delete OPG reports"
  ON public.opg_reports FOR DELETE
  USING (auth.role() = 'authenticated');

-- =============================================================
-- Grant access to Data API
-- =============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT ON public.appointments TO anon;
GRANT INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.orthodontics TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.opg_reports TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- =============================================================
-- Auth trigger: auto-create doctor profile on signup
-- =============================================================
CREATE OR REPLACE FUNCTION public.handle_new_doctor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  spec_array text[] := '{}'::text[];
BEGIN
  IF NEW.raw_user_meta_data ? 'specialties' THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data -> 'specialties')) INTO spec_array;
  END IF;

  INSERT INTO public.doctors (auth_id, username, display_name, role, specialties)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'Doctor'),
    spec_array
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_doctor();
