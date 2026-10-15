#!/usr/bin/env node
/** After `npm --prefix extension run package`: publish the ZIP for the website's download button. */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const src = new URL('../extension/solace-extension.zip', import.meta.url);
const dir = new URL('../public/downloads/', import.meta.url);
mkdirSync(dir, { recursive: true });
copyFileSync(src, new URL('solace-extension.zip', dir));
const { version } = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
writeFileSync(new URL('extension.json', dir), JSON.stringify({ version, file: 'solace-extension.zip' }, null, 2));
console.log(`Copied Mimi ${version} to public/downloads/solace-extension.zip`);
