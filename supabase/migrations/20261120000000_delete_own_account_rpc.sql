-- GDPR / App Store / Play Store self-service permanent account deletion RPC

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes iniciar sesión para eliminar tu cuenta.'
    );
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  DELETE FROM public.user_replays WHERE user_id = v_uid;
  DELETE FROM public.player_rankings WHERE player_id = v_uid;
  DELETE FROM public.profiles WHERE id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
