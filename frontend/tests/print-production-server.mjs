// Build only the synthetic print fixture into a new temporary directory and
// serve it with production CSP. No clinical API or database is contacted.
import { build } from "vite";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = await mkdtemp(join(tmpdir(), "akay-print-production-"));
await build({ root, build: { outDir: output, emptyOutDir: false,
  rollupOptions: { input: join(root, "tests/fixtures/print-preview.html") } } });
const policy = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; frame-src blob: https://challenges.cloudflare.com; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self';";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };
createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const target = resolve(output, `.${pathname}`);
  if (!target.startsWith(output + sep)) { response.writeHead(403).end(); return; }
  try {
    const data = await readFile(target);
    response.writeHead(200, { "Content-Type": types[extname(target)] || "application/octet-stream", "Content-Security-Policy": policy });
    response.end(data);
  } catch { response.writeHead(404).end(); }
}).listen(5176, "127.0.0.1", () => console.log(`Synthetic production print fixture: http://127.0.0.1:5176 (files: ${output})`));
