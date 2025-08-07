import { Pool } from 'pg';

const db = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_NAME,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

const query = `
  CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL,
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL,
    PRIMARY KEY ("sid")
  );
`;

db.query(query)
  .then(() => console.log('Migration successful'))
  .catch((err) => console.error('Migration error:', err))
  .finally(() => db.end());

console.log(process.env.DATABASE_URL);