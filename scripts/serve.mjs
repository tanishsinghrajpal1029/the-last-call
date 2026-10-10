// Static file server for build/web.
//   node scripts/serve.mjs                  -> http://localhost:8080 (desktop testing only)
//   node scripts/serve.mjs --https KEY CERT -> https on your LAN, using a certificate
//                                              your phone trusts (see docs/AR_DEVICE_TESTS.md)
import { createServer as http } from "node:http";
import { createServer as https } from "node:https";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "build", "web");
const args = process.argv.slice(2);
const port = Number(process.env.PORT || 8080);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".map": "application/json", ".txt": "text/plain" };

function handler(req, res) {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let file = path.normalize(path.join(root, url));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
}

const i = args.indexOf("--https");
if (i >= 0) {
  const [key, cert] = [args[i + 1], args[i + 2]];
  https({ key: readFileSync(key), cert: readFileSync(cert) }, handler).listen(port, "0.0.0.0", () => console.log(`https://0.0.0.0:${port}`));
} else {
  http(handler).listen(port, "127.0.0.1", () => console.log(`http://localhost:${port}  (localhost only; phones need trusted HTTPS)`));
}
