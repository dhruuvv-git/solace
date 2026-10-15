/**
 * Production build of the extension into dist/:
 *   1. vite build  -> sidepanel.html, popup.html, assets/, icons/, samples/
 *   2. esbuild     -> service-worker.js and content/*.js (single-file IIFE bundles)
 *   3. copy manifest.json and verify every file it references exists.
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

execSync('npx vite build --logLevel warn', { cwd: root, stdio: 'inherit' });

const common = { loader: { '.png': 'dataurl' }, bundle: true, format: 'iife', target: 'chrome116', minify: true, sourcemap: false, legalComments: 'none', logLevel: 'warning' };
await build({ ...common, entryPoints: [path.join(root, 'src/background/service-worker.ts')], outfile: path.join(dist, 'service-worker.js') });
for (const name of ['whatsapp', 'instagram', 'generic-site']) {
  await build({ ...common, entryPoints: [path.join(root, `src/content/${name}.ts`)], outfile: path.join(dist, 'content', `${name}.js`) });
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
// solace.config.json: pin the extension ID (so the website can find it) and list the website origins.
const config = JSON.parse(fs.readFileSync(path.join(root, '..', 'solace.config.json'), 'utf8'));
if (config.extensionKey) manifest.key = config.extensionKey;
if (Array.isArray(config.appOrigins) && config.appOrigins.length) manifest.externally_connectable = { matches: config.appOrigins };
fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));

// verify references
const refs = new Set([
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  manifest.action.default_popup,
  manifest.side_panel.default_path,
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((c) => c.js),
  'content/generic-site.js',
]);
const missing = [...refs].filter((r) => !fs.existsSync(path.join(dist, r)));
if (missing.length) {
  console.error('Missing files referenced by manifest:', missing);
  process.exit(1);
}
let total = 0;
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else total += st.size; } };
walk(dist);
console.log(`Extension ID: ${config.extensionId}  ·  website origins: ${(config.appOrigins ?? []).join(', ')}`);
console.log(`Solace extension built in dist/ (${(total / 1024).toFixed(0)} KB, ${refs.size} manifest references verified).`);
