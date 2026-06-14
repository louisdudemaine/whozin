/**
 * ✨ Haptique — vibrations subtiles aux gestes clés.
 * Web : navigator.vibrate (Android/PWA ; iOS Safari l'ignore silencieusement).
 * Respecte prefers-reduced-motion. Sans effet = jamais d'erreur.
 */

function canVibrate(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  return true;
}

function buzz(pattern: number | number[]): void {
  try {
    if (canVibrate()) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

/** tap léger — pression de bouton, changement d'onglet */
export const hapticTap = () => buzz(8);
/** confirmation positive — like, check-in, envoi */
export const hapticSuccess = () => buzz([12, 40, 12]);
/** impact — match, drop, balise */
export const hapticImpact = () => buzz([0, 30, 20, 30]);
/** avertissement — erreur, blocage */
export const hapticWarn = () => buzz([20, 60, 20]);
