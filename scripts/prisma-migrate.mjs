import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
  RUST_LOG: process.env.RUST_LOG ?? "info"
};

const prisma = spawnSync("prisma", ["migrate", "dev", ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: "inherit"
});

process.exit(prisma.status ?? 1);
