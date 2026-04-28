from supabase import create_client, Client
from app.config import SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# Service role client — bypasses RLS. Used for all data queries
# because the backend enforces user isolation in every query.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Anon client — used only for auth.get_user() to validate JWTs.
# This respects RLS and is the correct client for token validation.
supabase_auth: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
