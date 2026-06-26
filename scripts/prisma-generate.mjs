import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db" };

const generate = spawnSync("prisma", ["generate"], {
  cwd: root,
  env,
  stdio: "inherit"
});

process.exit(generate.status ?? 1);
