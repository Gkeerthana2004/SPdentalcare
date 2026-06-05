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
  { email: 'saranya@spdental.com', display_name: 'Dr. Saranya Mohan', role: 'General Surgeon' },
];

async function seed() {
  for (const doc of doctors) {
    const password = await ask(`Enter password for ${doc.email}: `);
    if (!password || password.length < 8) {
      console.error(`Password must be at least 8 characters. Skipping ${doc.email}.`);
      continue;
    }
    const { data, error } = await supabase.auth.admin.createUser({
      email: doc.email,
      password,
      email_confirm: true,
      user_metadata: { display_name: doc.display_name, role: doc.role }
    });
    if (error) {
      console.error(`${doc.email}: ${error.message}`);
    } else {
      console.log(`${doc.email}: created (${data.user.id})`);
    }
  }
  rl.close();
}

seed();
