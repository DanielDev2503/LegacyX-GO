-- Actualización del trigger handle_new_auth_user para auto-verificación inmediata en OAuth (Google) y confirmed_at

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_username VARCHAR(15);
  v_display_name VARCHAR(20);
  v_code VARCHAR(6);
  v_is_verified BOOLEAN;
  v_provider TEXT;
BEGIN
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');

  v_username := LEFT(
    REGEXP_REPLACE(
      COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'preferred_username'), ''),
        SPLIT_PART(NEW.email, '@', 1)
      ),
      '[^a-zA-Z0-9_]', '', 'g'
    ),
    15
  );

  IF v_username ILIKE 'inv_%' THEN
    v_username := SUBSTRING(v_username FROM 5);
  END IF;
  IF LENGTH(v_username) < 3 THEN
    v_username := 'usr_' || SUBSTRING(REPLACE(NEW.id::TEXT, '-', '') FROM 1 FOR 8);
  END IF;

  v_display_name := LEFT(
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      v_username
    ),
    20
  );
  v_code := NULLIF(LEFT(REGEXP_REPLACE(COALESCE(NEW.raw_user_meta_data->>'verification_code', ''), '[^0-9]', '', 'g'), 6), '');

  IF v_provider != 'email' OR NEW.email_confirmed_at IS NOT NULL THEN
    v_is_verified := TRUE;
    v_code := NULL;
  ELSE
    v_is_verified := FALSE;
  END IF;

  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    email,
    role,
    is_verified,
    verification_code,
    code_expires_at
  ) VALUES (
    NEW.id,
    v_username,
    v_display_name,
    LOWER(NEW.email),
    'jugador'::public.user_role,
    v_is_verified,
    v_code,
    CASE WHEN v_code IS NOT NULL THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE
  SET
    username = CASE 
      WHEN public.profiles.username ILIKE 'usr_%' AND EXCLUDED.username NOT ILIKE 'usr_%' THEN EXCLUDED.username 
      ELSE public.profiles.username 
    END,
    display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.profiles.display_name),
    is_verified = public.profiles.is_verified OR EXCLUDED.is_verified,
    verification_code = COALESCE(EXCLUDED.verification_code, public.profiles.verification_code),
    code_expires_at = COALESCE(EXCLUDED.code_expires_at, public.profiles.code_expires_at);

  IF v_is_verified THEN
    INSERT INTO public.player_rankings (player_id, elo)
    VALUES (NEW.id, 1000)
    ON CONFLICT (player_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
