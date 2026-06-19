import path from "node:path";
import type { NextConfig } from "next";

const widgetFrameAncestors = process.env.WIDGET_FRAME_ANCESTORS?.trim() || "'self'";
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(self), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@whosin/shared"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async headers() {
    return [
      {
        source: "/((?!widget).*)",
        headers: [
          ...baseSecurityHeaders,
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      {
        // Le widget B2B peut vivre en iframe, mais seulement sur les origines configurées.
        // Exemple prod: WIDGET_FRAME_ANCESTORS="'self' https://partenaire.example"
        source: "/widget/:path*",
        headers: [
          ...baseSecurityHeaders,
          { key: "Content-Security-Policy", value: `frame-ancestors ${widgetFrameAncestors}` },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
