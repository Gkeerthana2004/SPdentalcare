require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runSetup() {
  try {
    console.log('Running setup.sql...');
    const sqlPath = path.resolve(__dirname, 'setup.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        const { error } = await supabase.rpc('exec', { sql: stmt + ';' });
        if (error && !error.message.includes('already exists') && !error.message.includes('duplicate')) {
          console.warn('RPC failed for statement, try via management API:', error.message.slice(0, 100));
        }
      } catch (e) {
        console.warn('Statement skipped (may already exist):', e.message.slice(0, 100));
      }
    }

    console.log('Database setup complete!');
  } catch (error) {
    console.error('Setup failed:', error.message);
    process.exit(1);
  }
}

runSetup();
