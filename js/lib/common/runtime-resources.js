// Static resource metadata only. Shared by window infrastructure and module Workers.
export function resourceUrls(values) {
  const result = [];
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.origin !== location.origin || !/\.(?:js|mjs|json|bin|flf|txt|wasm|css|png)$/.test(url.pathname)) continue;
      if (!/^\?retry=\d+$/.test(url.search)) url.search = '';
      url.hash = '';
      result.push(url.href);
    } catch { /* Ignore non-URL performance entries. */ }
  }
  return result;
}

export function trackResources(report) {
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('resource')) {
    const observer = new PerformanceObserver((list) => report(resourceUrls(list.getEntries().map(({ name }) => name))));
    observer.observe({ type: 'resource', buffered: true });
    return observer;
  }
  return null;
}

export function trackWorkerResources() {
  try {
    // Worker termination closes the channel and its resource observer.
    const channel = new BroadcastChannel('wtools-used-static-assets');
    channel.postMessage(resourceUrls([location.href]));
    trackResources((urls) => channel.postMessage(urls));
  } catch { /* Computation remains available when resource reporting is unavailable. */ }
}
