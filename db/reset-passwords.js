require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const doctors = [
  { email: 'saranya@spdental.com', password: 'Doctor@123' },
];

async function reset() {
  const { data: users, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) { console.error('Failed to list users:', listErr.message); return; }

  for (const doc of doctors) {
    const user = users.users.find(u => u.email === doc.email);
    if (!user) { console.log(`${doc.email}: not found`); continue; }
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password: doc.password });
    if (error) {
      console.log(`${doc.email}: ${error.message}`);
    } else {
      console.log(`${doc.email}: password reset`);
    }
  }
}

reset().then(() => console.log('Done'));
