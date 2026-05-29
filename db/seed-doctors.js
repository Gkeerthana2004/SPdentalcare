require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const doctors = [
  { email: 'saranya@spdental.com', password: 'Doctor@123', display_name: 'Dr. Saranya Mohan', role: 'General Surgeon' },
];

async function seed() {
  for (const doc of doctors) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: doc.email,
      password: doc.password,
      email_confirm: true,
      user_metadata: { display_name: doc.display_name, role: doc.role }
    });
    if (error) {
      console.log(`${doc.email}: ${error.message}`);
    } else {
      console.log(`${doc.email}: created (${data.user.id})`);
    }
  }
}

seed().then(() => console.log('Done'));
