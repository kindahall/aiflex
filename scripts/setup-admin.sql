-- Promote a user to admin role (V7 §7.1, V8 §A12).
--
-- Usage:
--   1. Ensure the user has signed up normally via the app
--   2. Run this against your Postgres DB:
--        psql "$DATABASE_URL" -v email=your@email.com -f scripts/setup-admin.sql
--
-- Or edit inline:
--   UPDATE "User" SET role = 'admin' WHERE email = 'your@email.com';
--
-- Verification:
--   SELECT id, email, role FROM "User" WHERE role = 'admin';

\set email '''your@email.com'''

UPDATE "User"
SET role = 'admin'
WHERE email = :email
RETURNING id, email, role;

-- Rollback (demote):
--   UPDATE "User" SET role = 'user' WHERE email = 'your@email.com';
