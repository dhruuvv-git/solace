/**
 * Project-wide identity and website link, from solace.config.json.
 * Change the website there (or in Settings → Website) — no code edits needed.
 */
import cfg from '../../../solace.config.json';

export const APP = {
  name: cfg.appName as string,
  assistant: cfg.assistantName as string,
  websiteUrl: cfg.appUrl as string,
  extensionId: cfg.extensionId as string,
  origins: cfg.appOrigins as string[],
};

/** Only http(s) links are opened. */
export function safeWebsiteUrl(url: string | undefined | null): string | null {
  try {
    const u = new URL(url || APP.websiteUrl);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
