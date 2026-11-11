-- Replays Storage Bucket, public.user_replays table and name_changed flag
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS name_changed BOOLEAN DEFAULT FALSE NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('replays', 'replays', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_replays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(60) NOT NULL DEFAULT 'Partida grabada',
  storage_path TEXT NOT NULL,
  stadium_id TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  red_score INTEGER NOT NULL DEFAULT 0,
  blue_score INTEGER NOT NULL DEFAULT 0,
  red_acronym VARCHAR(6) NOT NULL DEFAULT 'RED',
  blue_acronym VARCHAR(6) NOT NULL DEFAULT 'BLUE',
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_replays_user_created 
  ON public.user_replays (user_id, created_at DESC);

ALTER TABLE public.user_replays ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_replays' 
      AND policyname = 'Usuarios gestionan sus propias repeticiones'
  ) THEN
    CREATE POLICY "Usuarios gestionan sus propias repeticiones"
      ON public.user_replays FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Usuarios suben sus propias repeticiones'
  ) THEN
    CREATE POLICY "Usuarios suben sus propias repeticiones"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'replays' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Usuarios leen sus propias repeticiones'
  ) THEN
    CREATE POLICY "Usuarios leen sus propias repeticiones"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'replays' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Usuarios borran sus propias repeticiones'
  ) THEN
    CREATE POLICY "Usuarios borran sus propias repeticiones"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'replays' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Usuarios actualizan sus propias repeticiones'
  ) THEN
    CREATE POLICY "Usuarios actualizan sus propias repeticiones"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'replays' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'replays' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
