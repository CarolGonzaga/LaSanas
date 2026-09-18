import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O formulário aceita arquivos de até 3 MB; a margem cobre o multipart.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
