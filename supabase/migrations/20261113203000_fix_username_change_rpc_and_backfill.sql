-- Fix one-time username change: backfill mismatched profiles and expose atomic SECURITY DEFINER RPC

DO $$
DECLARE
  v_max_len INTEGER;
  rec RECORD;
  v_clean TEXT;
  v_taken BOOLEAN;
BEGIN
  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  SELECT c.character_maximum_length
    INTO v_max_len
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'profiles'
     AND c.column_name = 'username';

  FOR rec IN
    SELECT id, username, display_name
      FROM public.profiles
     WHERE name_changed = TRUE
       AND display_name IS NOT NULL
       AND TRIM(display_name) <> ''
       AND display_name <> username
     ORDER BY created_at ASC NULLS LAST, id ASC
  LOOP
    v_clean := TRIM(rec.display_name);

    IF v_clean ~ '^[A-Za-z0-9_]{3,20}$'
       AND v_clean NOT ILIKE 'inv_%'
       AND (v_max_len IS NULL OR CHAR_LENGTH(v_clean) <= v_max_len)
    THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.profiles other
         WHERE other.id <> rec.id
           AND LOWER(other.username) = LOWER(v_clean)
      )
      INTO v_taken;

      IF NOT v_taken THEN
        UPDATE public.profiles
           SET username = v_clean,
               display_name = v_clean
         WHERE id = rec.id;

        UPDATE auth.users
           SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                 || jsonb_build_object('username', v_clean, 'display_name', v_clean)
         WHERE id = rec.id;

        CONTINUE;
      END IF;
    END IF;

    UPDATE public.profiles
       SET display_name = rec.username,
           name_changed = FALSE
     WHERE id = rec.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.change_username_once(p_new_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_clean TEXT := TRIM(COALESCE(p_new_username, ''));
  v_max_len INTEGER;
  v_profile RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes iniciar sesión para cambiar tu nombre de usuario.'
    );
  END IF;

  IF v_clean !~ '^[A-Za-z0-9_]{3,20}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El nombre de usuario debe tener entre 3 y 20 caracteres (solo letras, números y guion bajo _).'
    );
  END IF;

  IF v_clean ILIKE 'inv_%' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El prefijo inv_ está reservado exclusivamente para invitados.'
    );
  END IF;

  SELECT c.character_maximum_length
    INTO v_max_len
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'profiles'
     AND c.column_name = 'username';

  IF v_max_len IS NOT NULL AND CHAR_LENGTH(v_clean) > v_max_len THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('El nombre de usuario debe tener entre 3 y %s caracteres.', v_max_len)
    );
  END IF;

  SELECT id, username, display_name, name_changed
    INTO v_profile
    FROM public.profiles
   WHERE id = v_uid
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No se encontró el perfil asociado a esta cuenta.'
    );
  END IF;

  IF COALESCE(v_profile.name_changed, FALSE) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El nombre de usuario ya ha sido cambiado anteriormente y no puede modificarse más.'
    );
  END IF;

  IF LOWER(v_clean) = LOWER(v_profile.username) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El nuevo nombre es igual al actual.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id <> v_uid
       AND LOWER(p.username) = LOWER(v_clean)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ese nombre de usuario ya está en uso.'
    );
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  BEGIN
    UPDATE public.profiles
       SET username = v_clean,
           display_name = v_clean,
           name_changed = TRUE
     WHERE id = v_uid;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Ese nombre de usuario ya está en uso.'
      );
  END;

  UPDATE auth.users
     SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('username', v_clean, 'display_name', v_clean)
   WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'username', v_clean,
    'display_name', v_clean,
    'name_changed', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.change_username_once(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_username_once(text) TO authenticated;
