BEGIN;

REVOKE EXECUTE ON FUNCTION public.process_confirmed_deposit(uuid, text, text, text, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_confirmed_deposit(uuid, text, text, text, numeric, numeric)
  TO service_role;

COMMIT;
