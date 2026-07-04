import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
  RUST_LOG: process.env.RUST_LOG ?? "info"
};

const prisma = spawnSync(process.execPath, [prismaCli, "migrate", "dev", ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: "inherit"
});

process.exit(prisma.status ?? 1);
