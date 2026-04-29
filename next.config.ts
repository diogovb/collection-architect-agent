import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Native modules with platform-specific binaries (e.g. @resvg/resvg-js
  // for SVG→PNG rendering in the visual feedback loop) must be loaded by
  // Node, not bundled by Turbopack — bundling causes the
  // "non-ecmascript placeable asset" error on the .node binary.
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default nextConfig;
