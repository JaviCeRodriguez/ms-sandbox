import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

let sql: Sql | null = null;

export function getDb(databaseUrl = process.env.DATABASE_URL): Sql {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Postgres mode");
  }
  if (!sql) {
    sql = postgres(databaseUrl, { max: 10 });
  }
  return sql;
}
