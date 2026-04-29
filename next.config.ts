import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Native modules with platform-specific binaries (e.g. @resvg/resvg-js
  // for SVG→PNG rendering in the visual feedback loop) must be loaded by
  // Node, not bundled by Turbopack — bundling causes the
  // "non-ecmascript placeable asset" error on the .node binary.
  serverExternalPackages: ["@resvg/resvg-js"],
  // Pin Turbopack workspace root to this directory so .env.local is loaded
  // from the worktree (not from the parent repo, which also has a lockfile).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
