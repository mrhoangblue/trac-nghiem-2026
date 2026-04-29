import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable React StrictMode double-invocation in dev.
  // Production is unaffected (StrictMode never runs there).
  // Benefit: prevents double-mount of effects (CountdownTimer, wake lock, etc.)
  // which inflates memory usage when testing on a mobile device via dev server.
  reactStrictMode: false,

  poweredByHeader: false,
};

export default nextConfig;
