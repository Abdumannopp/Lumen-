-- Turn on row level security for every table in the public schema.
--
-- Why: Supabase publishes the public schema through its REST API, and that API
-- accepts the anon key, which is public by design (it is in the browser
-- bundle). With RLS off, anyone holding it can read and write these tables
-- directly, bypassing every check the application makes.
--
-- With RLS on and no policies the REST API sees nothing. The application is
-- unaffected: Prisma connects as the table owner (Supabase's `postgres` role),
-- and RLS does not apply to the owner. Do not add FORCE ROW LEVEL SECURITY and
-- do not point DATABASE_URL at a role that is neither the owner nor BYPASSRLS.
--
-- Loops over existing tables so it also covers Prisma's own _prisma_migrations.
-- A table added by a later migration must enable RLS itself; `npm run
-- db:drift` fails if one does not.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
