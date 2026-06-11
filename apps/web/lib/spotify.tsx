"use client";

/**
 * Spotify sans clé : détection de liens + lecteur embed officiel.
 * (L'OAuth « ce que j'écoute en ce moment » viendra avec une app Spotify dev.)
 */

const SPOTIFY_RE =
  /https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|playlist|album|artist|episode|show)\/([A-Za-z0-9]+)/;

export function findSpotifyLink(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = SPOTIFY_RE.exec(text);
  return m ? `https://open.spotify.com/${m[1]}/${m[2]}` : null;
}

export function spotifyEmbedUrl(url: string): string | null {
  const m = SPOTIFY_RE.exec(url);
  if (!m) return null;
  return `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0`;
}

/** Lecteur compact (80px = barre de lecture; 152/352 = avec pochette). */
export function SpotifyEmbed({ url, height = 80 }: { url: string; height?: number }) {
  const src = spotifyEmbedUrl(url);
  if (!src) return null;
  return (
    <iframe
      src={src}
      width="100%"
      height={height}
      frameBorder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      style={{ borderRadius: 14, display: "block" }}
      title="Spotify"
    />
  );
}
