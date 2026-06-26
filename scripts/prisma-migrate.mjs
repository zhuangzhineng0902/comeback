import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = "file:./dev.db";
const env = { ...process.env, DATABASE_URL: databaseUrl };
const args = ["migrate", "dev", ...process.argv.slice(2)];

const prisma = spawnSync("prisma", args, {
  cwd: root,
  env,
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 10
});

process.stdout.write(prisma.stdout ?? "");
process.stderr.write(prisma.stderr ?? "");

if (prisma.status === 0) {
  process.exit(0);
}

const output = `${prisma.stdout ?? ""}\n${prisma.stderr ?? ""}`;
if (!output.includes("Schema engine error")) {
  process.exit(prisma.status ?? 1);
}

console.warn("Prisma schema engine failed locally; applying committed SQLite migrations with sqlite3.");

const migrationsDir = join(root, "prisma", "migrations");
const dbPath = join(root, "prisma", "dev.db");

await mkdir(dirname(dbPath), { recursive: true });

function runSql(sql) {
  const sqlite = spawnSync("sqlite3", [dbPath], {
    cwd: root,
    input: sql,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10
  });

  process.stdout.write(sqlite.stdout ?? "");
  process.stderr.write(sqlite.stderr ?? "");

  if (sqlite.status !== 0) {
    process.exit(sqlite.status ?? 1);
  }
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

runSql(`
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
`);

const migrationNames = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const migrationName of migrationNames) {
  const migrationPath = join(migrationsDir, migrationName, "migration.sql");
  if (!existsSync(migrationPath)) {
    continue;
  }

  const existing = spawnSync(
    "sqlite3",
    [dbPath, `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = ${sqlString(migrationName)} LIMIT 1;`],
    { cwd: root, encoding: "utf8" }
  );

  if (existing.status !== 0) {
    process.stderr.write(existing.stderr ?? "");
    process.exit(existing.status ?? 1);
  }

  if ((existing.stdout ?? "").trim() === "1") {
    continue;
  }

  const migrationSql = readFileSync(migrationPath, "utf8");
  runSql(`BEGIN;\n${migrationSql}\nCOMMIT;`);

  const checksum = createHash("sha256").update(migrationSql).digest("hex");
  const now = new Date().toISOString();
  runSql(`
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES (${sqlString(randomUUID())}, ${sqlString(checksum)}, ${sqlString(now)}, ${sqlString(migrationName)}, NULL, NULL, ${sqlString(now)}, 1);
`);
  console.log(`Applied migration ${migrationName}`);
}

const generate = spawnSync("prisma", ["generate"], {
  cwd: root,
  env,
  stdio: "inherit"
});

process.exit(generate.status ?? 1);
