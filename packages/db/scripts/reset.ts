import pg from 'pg';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL não definida');
if (process.env.APP_ENV === 'production' || process.env.APP_ENV === 'staging') throw new Error('reset bloqueado neste ambiente');
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS app CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
console.log('Banco local zerado.');
await c.end();
