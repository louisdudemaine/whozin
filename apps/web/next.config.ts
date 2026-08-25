import path from "node:path";
import type { NextConfig } from "next";

// Le widget B2B est fait pour vivre chez les partenaires (place_widget ne sert que des
// agrégats anonymes, GRANT anon volontaire) → intégrable par défaut. Pour restreindre:
// WIDGET_FRAME_ANCESTORS="'self' https://partenaire.example"
const widgetFrameAncestors = process.env.WIDGET_FRAME_ANCESTORS?.trim() || "*";
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    // camera=(self) est REQUIS: les appels vidéo (lib/calls.tsx) demandent
    // getUserMedia({ video }). camera=() désactive la caméra même pour notre propre origine.
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

// Le widget est un document embarqué: CORP doit être cross-origin (sinon un embarqueur
// COEP le rejette). Une seule valeur par clé — on remplace au lieu d'ajouter.
const widgetSecurityHeaders = [
  ...baseSecurityHeaders.filter((h) => h.key !== "Cross-Origin-Resource-Policy"),
  { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
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
        source: "/widget/:path*",
        headers: [
          ...widgetSecurityHeaders,
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
