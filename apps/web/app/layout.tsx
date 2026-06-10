import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Unbounded } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const body = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const display = Unbounded({
  subsets: ["latin"],
  variable: "--font-disp",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Whozin — La ville s'allume. T'es où?",
  description:
    "Réseau social temps réel géolocalisé. Vois où sont les gens et partage ce qui se passe — bars, restos, festivals.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Whozin" },
};

export const viewport: Viewport = {
  themeColor: "#07070d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${body.variable} ${display.variable}`}>
      <body>
        {/* la nuit derrière tout, le grain par-dessus tout */}
        <div className="neon-rain" aria-hidden />
        <div className="grain" aria-hidden />
        <Providers>
          <div className="app-shell">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
