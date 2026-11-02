import pg from 'pg';

/** Cria/atualiza o papel de login da aplicação (sem BYPASSRLS, não é dono das tabelas). */
const admin = process.env.DATABASE_ADMIN_URL;
const password = process.env.APP_DB_PASSWORD;
if (!admin || !password) throw new Error('Defina DATABASE_ADMIN_URL e APP_DB_PASSWORD');

const client = new pg.Client({ connectionString: admin });
await client.connect();
const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'aos_app'");
const pwd = client.escapeLiteral(password);
await client.query(
  exists.rowCount
    ? `ALTER ROLE aos_app WITH LOGIN NOBYPASSRLS PASSWORD ${pwd}`
    : `CREATE ROLE aos_app WITH LOGIN NOBYPASSRLS PASSWORD ${pwd}`,
);
await client.query('GRANT CONNECT ON DATABASE ' + client.escapeIdentifier(client.database ?? 'postgres') + ' TO aos_app');
console.log('Papel aos_app pronto.');
await client.end();
