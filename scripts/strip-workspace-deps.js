/**
 * strip-workspace-deps.js — Remove workspace:* dependencies from package.json.
 * Used on Vercel where the monorepo workspace packages are not available.
 * The create-shims.js script runs after bun install to provide stub modules.
 */

import fs from "fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

for (const section of ["dependencies", "devDependencies"]) {
  if (!pkg[section]) continue;
  for (const [name, version] of Object.entries(pkg[section])) {
    if (String(version).startsWith("workspace:")) {
      delete pkg[section][name];
      console.log(`Stripped ${name} (${version}) from ${section}`);
    }
  }
}

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));
console.log("Workspace dependencies stripped.");
