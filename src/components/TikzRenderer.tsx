"use client";

import { useEffect, useRef } from "react";

interface TikzRendererProps {
  code: string;
  caption?: string;
}

/**
 * TikzRenderer — iframe/srcDoc strategy
 * ─────────────────────────────────────────────────────────────────────────────
 * Injects a self-contained HTML page into an iframe so TikZJax runs inside its
 * own DOM with its own DOMContentLoaded event, completely isolated from React.
 * No MutationObserver conflicts, no React lifecycle interference.
 *
 * Auto-resize: after the iframe loads, a postMessage from inside fires once
 * TikZJax has replaced the <script> with an <svg>, then we read the true height.
 */
export default function TikzRenderer({ code, caption }: TikzRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build a full self-contained HTML document
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" type="text/css" href="https://tikzjax.com/v1/fonts.css">
  <script src="https://tikzjax.com/v1/tikzjax.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      background: transparent;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100%;
    }
    svg { max-width: 100%; height: auto; }
  </style>
  <script>
    // Once TikZJax finishes it replaces <script type="text/tikz"> with <svg>.
    // Watch for that insertion, then tell the parent iframe the real height.
    document.addEventListener('DOMContentLoaded', function () {
      var observer = new MutationObserver(function () {
        var svg = document.querySelector('svg');
        if (svg) {
          observer.disconnect();
          // Small delay to let SVG finish painting before measuring
          setTimeout(function () {
            window.parent.postMessage(
              { type: 'tikz-height', height: document.body.scrollHeight },
              '*'
            );
          }, 100);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  </script>
</head>
<body>
  <script type="text/tikz">${code}</script>
</body>
</html>`;

  // Listen for the height message from the iframe
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (
        e.data?.type === "tikz-height" &&
        typeof e.data.height === "number" &&
        e.data.height > 0 &&
        iframeRef.current
      ) {
        iframeRef.current.style.height = `${e.data.height + 16}px`;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        style={{ border: "none" }}
        width="100%"
        height="220px"
        scrolling="no"
        title="TikZ figure"
      />
      {caption && (
        <p className="text-xs text-gray-500 italic text-center">{caption}</p>
      )}
    </div>
  );
}
