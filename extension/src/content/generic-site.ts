/**
 * Injected on demand (only after the user right-clicks with a Solace menu
 * item, via activeTab + scripting) on ordinary websites. It reads the image
 * the user clicked on from the page's own origin and answers status pings.
 * It adds no UI and does not watch the page.
 */
import type { PingReply } from '../shared/messaging';
import { onContentMessage } from './dom-utils';

declare global { interface Window { __trustlensGeneric?: boolean } }

if (!window.__trustlensGeneric) {
  window.__trustlensGeneric = true;
  const ping = (): PingReply => ({ ok: true, platform: 'web', features: { 'right-click checks': 'active' }, notes: ['Ordinary website: Solace only acts when you right-click.'] });
  onContentMessage('web', ping);
}
