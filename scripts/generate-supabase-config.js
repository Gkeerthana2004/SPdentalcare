const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env');
const outputPath = path.resolve(process.cwd(), 'public', 'js', 'supabase-config.js');

function parseDotEnv(content) {
  return content
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return env;
      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex === -1) return env;
      const key = trimmed.slice(0, equalsIndex).trim();
      let value = trimmed.slice(equalsIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
      return env;
    }, {});
}

const env = fs.existsSync(envPath) ? parseDotEnv(fs.readFileSync(envPath, 'utf8')) : {};
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const missing = [];
if (!env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  missing.push('NEXT_PUBLIC_SUPABASE_URL');
}
if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
}

const fileContent = `// Generated from .env by scripts/generate-supabase-config.js
(function () {
  const config = {
    SUPABASE_URL: ${JSON.stringify(SUPABASE_URL)},
    SUPABASE_ANON_KEY: ${JSON.stringify(SUPABASE_ANON_KEY)}
  };
  if (typeof window !== 'undefined') {
    window.SUPABASE_CONFIG = Object.assign(window.SUPABASE_CONFIG || {}, config);
  }
})();
`;

fs.writeFileSync(outputPath, fileContent, 'utf8');
console.log('Generated', outputPath);
if (missing.length) {
  console.warn('Warning: missing environment variables:', missing.join(', '));
  process.exitCode = 1;
}
