import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db" };

const generate = spawnSync(process.execPath, [prismaCli, "generate"], {
  cwd: root,
  env,
  stdio: "inherit"
});

process.exit(generate.status ?? 1);
