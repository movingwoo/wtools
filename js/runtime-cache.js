// Record only static resource URLs so first-visit imports can be cached after SW activation.
// Worker imports have their own performance timeline; a same-origin channel forwards them.
// No tool inputs, results, keys, or document content are sent or persisted here.
import { resourceUrls, trackResources } from './lib/common/runtime-resources.js';

const pending = new Set();
let container = null, channel = null;
try { container = navigator.serviceWorker; } catch { /* Sandboxed previews. */ }

function send() {
  if (!pending.size) return;
  const urls = [...pending];
  if (!container?.controller) return;
  container.controller.postMessage({ type: 'CACHE_USED_ASSETS', urls });
  pending.clear();
}

function record(urls) {
  for (const url of resourceUrls(urls)) pending.add(url);
  send();
}

function connect() {
  try {
    channel = new BroadcastChannel('wtools-used-static-assets');
    channel.onmessage = ({ data }) => { if (Array.isArray(data)) record(data); };
  } catch { /* Resource timing for this context still works without a channel. */ }
}

connect();
container?.addEventListener('controllerchange', send);
window.addEventListener('pagehide', () => { channel?.close(); channel = null; });
window.addEventListener('pageshow', () => { if (!channel) connect(); send(); });
trackResources(record);
