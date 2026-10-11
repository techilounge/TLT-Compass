import { execFileSync } from "node:child_process";
import process from "node:process";
import { Buffer } from "node:buffer";
import { readFileSync, statSync } from "node:fs";
const candidates = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Supabase secret", /sb_secret_[A-Za-z0-9_-]{20,}/],
  [
    "GitHub token",
    /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/,
  ],
  ["AWS access key", /AKIA[A-Z0-9]{16}/],
  ["provider key", /sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}/],
];
let failures = 0;
for (const path of new Set(candidates)) {
  if (
    path === "package-lock.json" ||
    !statSync(path).isFile() ||
    statSync(path).size > 2_000_000
  )
    continue;
  const contents = readFileSync(path, "utf8");
  if (contents.includes("\0")) continue;
  for (const [label, pattern] of patterns)
    if (pattern.test(contents)) {
      process.stderr.write(`${path}: possible ${label}\n`);
      failures++;
    }
  for (const token of contents.match(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  ) ?? []) {
    try {
      if (
        JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
          .role === "service_role"
      ) {
        process.stderr.write(`${path}: possible service-role token\n`);
        failures++;
      }
    } catch {
      /* Not a JSON JWT. */
    }
  }
}
if (failures) process.exitCode = 1;
else
  process.stdout.write("No recognized secret patterns in Git-visible files.\n");
