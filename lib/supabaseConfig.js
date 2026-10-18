/* ==========================================================================
   supabaseConfig.js, which Supabase project the app talks to
   The production project is written down here rather than read from the
   host's environment, so every deploy of this repo (volunteeruapp.com and its
   previews) uses the same database whatever a hosting dashboard says. The URL
   and the anon key are public by design: every browser receives them, and
   row-level security on each table decides what a visitor can read or write.
   A local stack (the test mock or `supabase start`) still overrides them
   through NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
   ========================================================================== */

const PROJECT_URL = 'https://wbvgryuvmyckhffsjxvt.supabase.co';
const PROJECT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndidmdyeXV2bXlja2hmZnNqeHZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNjk4MDQsImV4cCI6MjEwNzg0NTgwNH0.vqqPZgKdyPuLfANd3yV19BuvSx9hnAJ_pstLvS8vN4Y';

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(envUrl) && Boolean(envKey);

export const supabaseUrl = local ? envUrl : PROJECT_URL;
export const supabaseAnonKey = local ? envKey : PROJECT_ANON_KEY;
