-- LegacyX-GO Canonical Supabase Schema: Accounts, Roles, Rankings & Ranked Match RPCs

CREATE TYPE public.user_role AS ENUM ('superadmin', 'representante', 'jugador');

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(15) UNIQUE NOT NULL,
  display_name VARCHAR(20) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role public.user_role DEFAULT 'jugador'::public.user_role NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_code VARCHAR(6),
  code_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_no_guest_prefix CHECK (username NOT ILIKE 'inv_%')
);

CREATE TABLE IF NOT EXISTS public.player_rankings (
  player_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  elo INTEGER DEFAULT 1000 NOT NULL,
  matches_played INTEGER DEFAULT 0 NOT NULL,
  wins INTEGER DEFAULT 0 NOT NULL,
  losses INTEGER DEFAULT 0 NOT NULL,
  draws INTEGER DEFAULT 0 NOT NULL,
  goals INTEGER DEFAULT 0 NOT NULL,
  assists INTEGER DEFAULT 0 NOT NULL,
  saves INTEGER DEFAULT 0 NOT NULL,
  mvp_count INTEGER DEFAULT 0 NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ranked_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_token TEXT UNIQUE NOT NULL,
  host_id UUID REFERENCES public.profiles(id) NOT NULL,
  stadium_id TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  red_score INTEGER NOT NULL,
  blue_score INTEGER NOT NULL,
  winner TEXT CHECK (winner IN ('red', 'blue', 'draw')),
  status TEXT CHECK (status IN ('COMPLETED', 'ABORTED')) DEFAULT 'COMPLETED',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rankings_elo ON public.player_rankings (elo DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_goals ON public.player_rankings (goals DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_assists ON public.player_rankings (assists DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_saves ON public.player_rankings (saves DESC);
CREATE INDEX IF NOT EXISTS idx_ranked_matches_host_id ON public.ranked_matches (host_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles (LOWER(email));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranked_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Perfiles públicos legibles por todos"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Usuarios pueden actualizar su propio perfil"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Rankings legibles públicamente"
  ON public.player_rankings FOR SELECT USING (true);

CREATE POLICY "Partidas clasificatorias legibles públicamente"
  ON public.ranked_matches FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.get_leaderboard(category TEXT, limit_count INT DEFAULT 50)
RETURNS TABLE (
  "position" BIGINT,
  player_id UUID,
  username VARCHAR(15),
  metric_value INTEGER,
  elo INTEGER
) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        CASE
          WHEN category = 'goals' THEN pr.goals
          WHEN category = 'assists' THEN pr.assists
          WHEN category = 'saves' THEN pr.saves
          ELSE pr.elo
        END DESC,
        pr.elo DESC,
        p.created_at ASC
    ) AS "position",
    p.id AS player_id,
    p.username,
    CASE
      WHEN category = 'goals' THEN pr.goals
      WHEN category = 'assists' THEN pr.assists
      WHEN category = 'saves' THEN pr.saves
      ELSE pr.elo
    END AS metric_value,
    pr.elo
  FROM public.player_rankings pr
  JOIN public.profiles p ON p.id = pr.player_id
  WHERE p.is_verified = TRUE
    AND p.username NOT ILIKE 'inv_%'
  LIMIT GREATEST(1, LEAST(COALESCE(limit_count, 50), 200));
END;
$$;
