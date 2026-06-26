import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db" };

const seed = spawnSync(process.execPath, [tsxCli, "prisma/seed.ts"], {
  cwd: root,
  env,
  stdio: "inherit"
});

process.exit(seed.status ?? 1);
