import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('customer order history requires a verified Supabase identity', () => {
  const route = read('app/api/account/orders/route.ts');
  assert.match(route, /auth\.auth\.getUser\(token\)/);
  assert.match(route, /user\.email_confirmed_at/);
  assert.match(route, /\.eq\('email', user\.email\)/);
  assert.match(route, /Cache-Control': 'no-store, private'/);
  assert.doesNotMatch(route, /tracking_token_hash|shipping_address|customer_name|phone/);
});

test('customer order history UI uses the authenticated session and private API', () => {
  const component = read('components/CustomerOrderHistory.tsx');
  assert.match(component, /getSession\(\)/);
  assert.match(component, /Authorization: 'Bearer ' \+ token/);
  assert.match(component, /cache: 'no-store'/);
});

test('storefront retains critical production routes and database migrations', () => {
  for (const path of [
    'app/api/health/route.ts',
    'app/api/orders/route.ts',
    'app/api/orders/track/route.ts',
    'app/api/admin/store/route.ts',
    'app/api/webhooks/razorpay/route.ts',
    'supabase/migrations/20261103_database_order_rate_limit.sql',
    'supabase/migrations/20261104_tracking_rate_limit.sql',
    'supabase/migrations/20261107_manual_courier_tracking.sql',
  ]) assert.ok(existsSync(new URL('../' + path, import.meta.url)), path + ' must exist');
});

test('all migration filenames are date-prefixed and unique', () => {
  const files = readdirSync(new URL('../supabase/migrations/', import.meta.url));
  assert.ok(files.length > 0);
  assert.equal(new Set(files).size, files.length);
  for (const file of files) assert.match(file, /^\d{8}_[a-z0-9_]+\.sql$/);
});

test('service-role credentials are not exposed through public environment variables', () => {
  const example = read('.env.example');
  assert.doesNotMatch(example, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  const browserClient = read('lib/supabase-browser.ts');
  assert.doesNotMatch(browserClient, /SUPABASE_SERVICE_ROLE_KEY/);
});
