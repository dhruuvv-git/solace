import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { base64ToBytes, type PanelJob } from '../shared/messaging';
import { AppShell, ErrorBoundary } from '../ui/App';
import { AppProvider, useApp, type View } from '../ui/app-context';
import { ToastProvider, useToast } from '../ui/components';
import '../ui/theme.css';

/** Picks up work handed over by the service worker (context menu, page buttons). */
function JobConsumer() {
  const { go } = useApp();
  const toast = useToast();
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.session) return;
    let lastId = '';
    const handle = (job: PanelJob | undefined) => {
      if (!job || job.id === lastId) return;
      lastId = job.id;
      void chrome.storage.session.remove('pendingJob');
      if (Date.now() - job.createdAt > 5 * 60_000) return; // stale
      switch (job.kind) {
        case 'image': {
          let bytes: Uint8Array;
          try { bytes = base64ToBytes(job.base64); } catch { go('real', { view: 'real', error: 'The image data from the page was damaged. Save the image and upload it instead.' }); return; }
          go('real', { view: 'real', image: { bytes, name: job.name }, source: job.source });
          break;
        }
        case 'image-error':
          go('real', { view: 'real', error: job.message, source: job.source });
          break;
        case 'text':
          if (job.mode === 'misinfo') go('real', { view: 'real', text: job.text, source: job.source });
          else if (job.mode === 'kind') go('kind', { view: 'kind', text: job.text, source: job.source });
          else go('safety', { view: 'safety', text: job.text, source: job.source });
          break;
        case 'evidence-saved':
          go('locker', { view: 'locker', highlightId: job.evidenceId });
          toast(job.screenshot ? 'Saved to Evidence Locker with screenshot' : `Saved to Evidence Locker without screenshot${job.note ? ` (${job.note})` : ''}`);
          break;
        case 'profile':
          go('identity', { view: 'identity', profile: job.profile, imageBytes: job.imageBase64 ? base64ToBytes(job.imageBase64) : undefined, imageError: job.imageError, source: job.source });
          break;
        case 'navigate':
          go(job.view as View);
          break;
      }
    };
    chrome.storage.session.get('pendingJob').then((r) => handle(r.pendingJob as PanelJob | undefined));
    const l = (ch: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'session' && ch.pendingJob?.newValue) handle(ch.pendingJob.newValue as PanelJob); };
    chrome.storage.onChanged.addListener(l);
    return () => chrome.storage.onChanged.removeListener(l);
  }, [go, toast]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AppProvider mode="extension">
      <ToastProvider>
        <JobConsumer />
        <AppShell compact />
      </ToastProvider>
    </AppProvider>
  </ErrorBoundary>,
);
