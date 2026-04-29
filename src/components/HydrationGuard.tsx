/**
 * HydrationGuard — strips browser-injected attributes from <html> and <body>
 * before React hydration begins, preventing "attribute mismatch" errors.
 *
 * Chrome's Remote Frame protocol (and Firebase Auth iframes) inject
 * __gcrremoteframetoken into the <html> element at the browser level.
 * React sees this as a server/client mismatch and logs a hydration error
 * even when suppressHydrationWarning is set, because Next.js 16 dev overlay
 * intercepts the error before React can suppress it.
 *
 * This inline script runs synchronously during HTML parsing — before React's
 * hydrateRoot() is called — so the attribute is already gone when React
 * compares server HTML vs client DOM.
 */
export default function HydrationGuard() {
  const script = `
(function(){
  var el = document.documentElement;
  if (el && el.hasAttribute('__gcrremoteframetoken')) {
    el.removeAttribute('__gcrremoteframetoken');
  }
})();
`;
  return (
    <script
      // biome-ignore lint: this inline script is intentional and safe
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
