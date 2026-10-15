/**
 * Builds a self-contained, sanitised HTML evidence report (and a JSON
 * export). All user/page text is HTML-escaped; screenshots are embedded only
 * when they are well-formed image data URLs. No scripts are included.
 */
import type { EvidenceRecord } from '../shared/types';
import { verifyFingerprint } from './fingerprint';

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const SAFE_IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export async function buildHtmlReport(records: EvidenceRecord[], generatedAt = new Date()): Promise<string> {
  const rows = await Promise.all(records.map(async (r, i) => {
    const ok = await verifyFingerprint(r);
    const img = r.screenshot && SAFE_IMG.test(r.screenshot) ? `<img alt="Screenshot ${i + 1}" src="${r.screenshot}">` : '<p class="muted">No screenshot</p>';
    return `<section>
<h2>Item ${i + 1}</h2>
<table>
<tr><th>Recorded (UTC)</th><td>${escapeHtml(r.timestamp)}</td></tr>
<tr><th>Source URL</th><td>${escapeHtml(r.url)}</td></tr>
<tr><th>Platform</th><td>${escapeHtml(r.platform)}</td></tr>
${r.senderLabel ? `<tr><th>Sender (as shown)</th><td>${escapeHtml(r.senderLabel)}</td></tr>` : ''}
${r.category ? `<tr><th>Detected category</th><td>${escapeHtml(r.category)}</td></tr>` : ''}
${r.severity !== undefined ? `<tr><th>Severity</th><td>${escapeHtml(r.severity.toFixed(2))}</td></tr>` : ''}
${r.riskScore !== undefined ? `<tr><th>Risk score</th><td>${escapeHtml(r.riskScore)} / 25 (${escapeHtml(r.riskLevel ?? '')})</td></tr>` : ''}
${r.note ? `<tr><th>Note</th><td>${escapeHtml(r.note)}</td></tr>` : ''}
<tr><th>SHA-256 fingerprint</th><td><code>${escapeHtml(r.fingerprint)}</code><br><span class="${ok ? 'ok' : 'bad'}">${ok ? 'Re-computed at export: unchanged since saved' : 'Re-computed at export: DOES NOT MATCH (record changed or corrupted)'}</span></td></tr>
</table>
<h3>Message text</h3>
<pre>${escapeHtml(r.text || '(none)')}</pre>
${img}
</section>`;
  }));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>Solace evidence report</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:860px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-top:1px solid #cbd5e1;padding-top:16px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid #e2e8f0}th{width:190px;color:#475569;font-weight:600}
pre{white-space:pre-wrap;background:#f1f5f9;padding:10px;border-radius:6px}img{max-width:100%;border:1px solid #cbd5e1;border-radius:6px;margin-top:8px}
code{word-break:break-all}.ok{color:#15803d}.bad{color:#b91c1c;font-weight:600}.muted{color:#64748b}.note{background:#fff7ed;border:1px solid #fed7aa;padding:10px;border-radius:6px}
</style></head><body>
<h1>Solace evidence report</h1>
<p class="muted">Generated ${escapeHtml(generatedAt.toISOString())} · ${records.length} item(s) · created locally on the user's device</p>
<p class="note">Each fingerprint is SHA-256 over (screenshot, text, timestamp, URL) using the Solace V1 canonical format. A matching fingerprint shows the record has not changed since it was saved in Solace. It does not by itself prove that the original content is genuine. Report cyber crime at https://cybercrime.gov.in/ or call 1930; in an emergency call 112.</p>
${rows.join('\n')}
</body></html>`;
}

export function buildJsonExport(records: EvidenceRecord[]): string {
  return JSON.stringify({ format: 'solace-evidence', version: 1, exportedAt: new Date().toISOString(), records }, null, 2);
}
