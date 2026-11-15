import { createDatabase, initializeDatabase } from "./database.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

console.log("Connecting to Supabase...");
const pool = createDatabase(connectionString);

pool.on("error", (err) => {
  console.error("Unexpected pool error:", err.message);
});

try {
  console.log("Initializing database schema...");
  await initializeDatabase(pool);
  console.log("✓ Tables created successfully");

  const result = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  console.log("Tables:", result.rows.map((r) => r.tablename).join(", "));

  await pool.end();
  console.log("✓ Migration complete");
} catch (err) {
  console.error("✗ Migration failed:", err.message);
  if (err.code === "28P01") {
    console.error("\n→ Password authentication failed. Verify credentials in Supabase dashboard:");
    console.error("  Settings → Database → Connection pooling → Session pooler");
  }
  await pool.end().catch(() => {});
  process.exit(1);
}