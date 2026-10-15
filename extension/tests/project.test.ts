/** Static checks on the manifest, permissions and unsafe code patterns. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const srcFiles: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) srcFiles.push(p); } };
walk(path.join(root, 'src'));
const allSrc = srcFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

describe('manifest', () => {
  it('is Manifest V3 with a service worker, side panel and popup', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background.service_worker).toBe('service-worker.js');
    expect(manifest.side_panel.default_path).toBe('sidepanel.html');
    expect(manifest.action.default_popup).toBe('popup.html');
  });

  it('requests only permissions the code uses', () => {
    expect(manifest.permissions.sort()).toEqual(['activeTab', 'contextMenus', 'scripting', 'sidePanel', 'storage']);
    expect(allSrc).toMatch(/chrome\.contextMenus\./);
    expect(allSrc).toMatch(/chrome\.storage\./);
    expect(allSrc).toMatch(/chrome\.sidePanel\./);
    expect(allSrc).toMatch(/chrome\.scripting\.executeScript/);
    expect(allSrc).toMatch(/captureVisibleTab/); // relies on activeTab after a context-menu click
    expect(manifest.permissions).not.toContain('tabs');
    expect(manifest.permissions).not.toContain('<all_urls>');
    expect(manifest.host_permissions).not.toContain('<all_urls>');
    expect(manifest.optional_host_permissions).toEqual(['<all_urls>', 'https://api.groq.com/*']);
  });

  it('content scripts only run on WhatsApp Web and Instagram', () => {
    const matches = manifest.content_scripts.flatMap((c: { matches: string[] }) => c.matches);
    expect(matches).toEqual(['https://web.whatsapp.com/*', 'https://www.instagram.com/*']);
  });

  it('CSP allows only self scripts', () => {
    expect(manifest.content_security_policy.extension_pages).toBe("script-src 'self'; object-src 'self'");
  });
});

describe('unsafe patterns', () => {
  it('no eval / new Function / remote scripts', () => {
    expect(allSrc).not.toMatch(/\beval\(/);
    expect(allSrc).not.toMatch(/new Function\(/);
    expect(allSrc).not.toMatch(/<script[^>]+src=["']https?:/);
  });

  it('innerHTML is only used for a static SVG constant', () => {
    const uses = allSrc.match(/\.innerHTML\s*=\s*[^;]+;/g) ?? [];
    expect(uses).toEqual(['.innerHTML = SHIELD_SVG;']);
    expect(allSrc).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it('network calls: only the optional Groq API (src/ai) and the Solace account API (src/account)', () => {
    const acct = fs.readFileSync(path.join(root, 'src/account/account.ts'), 'utf8');
    expect(acct).toMatch(/credentials: 'omit'/); // never sends website cookies
    expect(acct).not.toMatch(/https?:\/\//); // base URL comes from solace.config.json / Settings
  });

  it('the only third-party service is the optional Groq API, and only from src/ai', () => {
    const fetches = allSrc.match(/fetch\([^)]*\)/g) ?? [];
    for (const f of fetches) expect(f).not.toMatch(/https?:\/\//);
    const groqFiles = srcFiles.filter((f) => /https:\/\/api\.groq\.com\/openai/.test(fs.readFileSync(f, "utf8")));
    expect(groqFiles.every((f) => /src[\\/]ai[\\/]/.test(f))).toBe(true);
  });
});
