import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('customer order history requires a verified Supabase identity', () => {
  const route = read('app/api/account/orders/route.ts');
  assert.match(route, /auth\.auth\.getUser\(token\)/);
  assert.match(route, /user\.email_confirmed_at/);
  assert.match(route, /\.eq\('email', user\.email\.toLowerCase\(\)\)/);
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


test('admin inventory adjustments are visible as an optional owner-only audit history', () => {
  const route = read('app/api/admin/store/route.ts');
  const page = read('app/admin/page.tsx');
  assert.match(route, /from\('inventory_adjustments'\)/);
  assert.match(route, /previous_stock,new_stock,reason,adjusted_by,created_at/);
  assert.match(route, /inventoryHistoryWarning/);
  assert.match(page, /Recent stock adjustments/);
  assert.match(page, /entry\.previous_stock/);
  assert.match(page, /entry\.adjusted_by/);
});


test('admin Excel order export is owner-authenticated, paginated, private and grouped by India order date', () => {
  const route = read('app/api/admin/orders/export/route.ts');
  const page = read('app/admin/page.tsx');
  const packageJson = JSON.parse(read('package.json'));
  assert.match(route, /requireAdmin\\(request\\)/);
  assert.match(route, /\\.range\\(offset, offset \\+ pageSize - 1\\)/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /application\\/vnd\\.openxmlformats-officedocument\\.spreadsheetml\\.sheet/);
  assert.match(route, /Cache-Control.*no-store, private/);
  assert.match(route, /new Map<string, OrderRow\\[\\]>/);
  assert.match(route, /timeZone: 'Asia\\/Kolkata'/);
  assert.match(route, /workbook\\.addWorksheet\\('Summary'\\)/);
  assert.match(route, /workbook\\.addWorksheet\\(date\\)/);
  assert.match(route, /formula marker|user-controlled text inert/);
  assert.match(route, /payment_status/);
  assert.equal(packageJson.dependencies.exceljs, '^4.4.0');
  assert.match(page, /EXPORT ORDERS \\(EXCEL\\)/);
  assert.match(page, /Authorization: 'Bearer ' \\+ token/);
  assert.match(page, /application\\/vnd\\.openxmlformats-officedocument\\.spreadsheetml\\.sheet/);
  assert.match(page, /\\/api\\/admin\\/orders\\/export/);
});
