import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output powers the desktop/Docker bundle. Vercel performs its
  // own tracing and currently fails when standalone is enabled there.
  output: process.env.VERCEL ? undefined : "standalone",

  // The cover image arrives as a base64 data URL and is written straight
  // into the page and the EPUB, so the optimizer has nothing to do with it.
  images: { unoptimized: true },

  // Native/CJS packages that must stay outside the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "pdfkit", "epub-gen-memory", "@openai/codex-sdk", "@anthropic-ai/claude-agent-sdk"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
