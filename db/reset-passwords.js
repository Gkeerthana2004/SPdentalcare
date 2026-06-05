require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

const doctors = [
  { email: 'saranya@spdental.com' },
];

async function reset() {
  const { data: users, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) { console.error('Failed to list users:', listErr.message); rl.close(); return; }

  for (const doc of doctors) {
    const user = users.users.find(u => u.email === doc.email);
    if (!user) { console.log(`${doc.email}: not found`); continue; }
    const password = await ask(`Enter new password for ${doc.email}: `);
    if (!password || password.length < 8) {
      console.error(`Password must be at least 8 characters. Skipping ${doc.email}.`);
      continue;
    }
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (error) {
      console.log(`${doc.email}: ${error.message}`);
    } else {
      console.log(`${doc.email}: password reset`);
    }
  }
  rl.close();
}

reset().then(() => console.log('Done'));
