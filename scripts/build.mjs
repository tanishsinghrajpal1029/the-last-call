// Build the static web app into build/web (no bundler, no npm dependencies).
// Requires the TypeScript compiler `tsc` on PATH.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "build", "web");

rmSync(path.join(root, "build", "js"), { recursive: true, force: true });
execSync("tsc -p .", { cwd: root, stdio: "inherit" });

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "data"), { recursive: true });
for (const f of ["index.html", "style.css", "marker.html"]) cpSync(path.join(root, "apps/web", f), path.join(out, f));
for (const dir of ["apps", "packages"]) {
  cpSync(path.join(root, "build/js", dir), path.join(out, "js", dir), {
    recursive: true,
    filter: (src) => statSync(src).isDirectory() || src.endsWith(".js") || src.endsWith(".js.map"),
  });
}
cpSync(path.join(root, "shared/nights.json"), path.join(out, "data/nights.json"));
cpSync(path.join(root, "LICENSE"), path.join(out, "LICENSE.txt"));
writeFileSync(path.join(out, ".nojekyll"), "");
console.log("built", path.relative(root, out));
