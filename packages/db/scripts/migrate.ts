import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL não definida');
const pool = new pg.Pool({ connectionString: url, max: 1 });
await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
console.log('Migrações aplicadas.');
await pool.end();
