// ============================================================
// auth.js — Auth logic for app.html
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Chuyen huong ve login neu chua dang nhap
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  window.location.replace('index.html');
}

const user = session.user;

// Hien thi thong tin user
const avatarEl = document.getElementById('user-avatar');
const nameEl   = document.getElementById('user-name');

const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
if (avatarUrl) {
  avatarEl.src = avatarUrl;
  avatarEl.classList.remove('hidden');
}

const displayName =
  user.user_metadata?.full_name ||
  user.user_metadata?.name ||
  user.email?.split('@')[0] ||
  'User';
nameEl.textContent = displayName;

// Logout
document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.replace('index.html');
});

export { user };
