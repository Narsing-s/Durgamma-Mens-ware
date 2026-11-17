import { existsSync, readdirSync, readFileSync } from 'node:fs';

const required = [
  'app/api/health/route.ts',
  'app/api/orders/route.ts',
  'app/api/orders/track/route.ts',
  'app/api/admin/store/route.ts',
  'app/api/account/orders/route.ts',
  'components/CustomerOrderHistory.tsx',
  'supabase/schema.sql',
  '.github/workflows/ci.yml',
];
const missing = required.filter((path) => !existsSync(path));
if (missing.length) {
  console.error('[FAIL] Missing required production files:', missing.join(', '));
  process.exit(1);
}

const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql'));
const invalid = migrations.filter((name) => !/^\d{8}_[a-z0-9_]+\.sql$/.test(name));
if (invalid.length) {
  console.error('[FAIL] Migration filenames must use YYYYMMDD_description.sql:', invalid.join(', '));
  process.exit(1);
}
if (new Set(migrations).size !== migrations.length) {
  console.error('[FAIL] Duplicate migration filenames detected.');
  process.exit(1);
}

const customerRoute = readFileSync('app/api/account/orders/route.ts', 'utf8');
for (const [label, pattern] of [
  ['verified authentication', /auth\.auth\.getUser\(token\)/],
  ['verified email requirement', /user\.email_confirmed_at/],
  ['email-scoped query', /\.eq\('email', user\.email\)/],
  ['private no-store response', /Cache-Control': 'no-store, private'/],
]) {
  if (!pattern.test(customerRoute)) {
    console.error('[FAIL] Customer order history is missing:', label);
    process.exit(1);
  }
}

console.log('[PASS] Required production routes and customer account feature exist');
console.log('[PASS] Supabase migration filenames are valid and unique');
console.log('[PASS] Customer order history enforces verified, owner-scoped access');
console.log('[PASS] Private customer responses disable caching');
