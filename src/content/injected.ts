// Injected script — runs in page context (not extension context)
// Used to access page-level JS variables (e.g. ytInitialPlayerResponse)

(function () {
  // Capture media URLs intercepted via XHR/fetch and expose them
  const captured = new Set<string>();
  (window as any).__uvd_captured_urls = captured;

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
    const u = String(url);
    if (u.includes('.m3u8') || u.includes('.mpd') || u.includes('videoplayback')) {
      captured.add(u);
    }
    return origOpen.apply(this, arguments as any);
  };

  const origFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (u.includes('.m3u8') || u.includes('.mpd') || u.includes('videoplayback')) {
      captured.add(u);
    }
    return origFetch.apply(window, [input, init] as any);
  };
})();
