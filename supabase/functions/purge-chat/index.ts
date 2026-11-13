// Purge du bucket privé « chat » (lot 2, partie E).
// La base désigne les fichiers à retirer (public.chat_a_purger) ; cette fonction les efface par l'API
// Storage, seule voie permise (Supabase bloque l'effacement direct dans storage.objects).
// Appelée par pg_cron toutes les 10 minutes avec le jeton de Vault (en-tête x-purge-jeton).
// ⚠️ DÉPLOYER SANS VÉRIFICATION DE JWT : `npm run deploy:purge-chat` (--no-verify-jwt). pg_cron n'envoie
// pas de JWT : avec la vérification, la passerelle répondrait 401 et rien ne partirait, sans bruit.
// Sans le bon jeton, chat_a_purger refuse et rien n'est retiré.
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const LOT = 500;
const BUDGET_MS = 15_000; // testé avant chaque tour : le dernier finit sous le délai de 30 s de pg_net

/** Nouvelle clé secrète (SUPABASE_SECRET_KEYS) d'abord ; l'ancienne clé service_role cesse à la fin de 2026. */
function cleService(): string {
  try {
    const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")?.default;
    if (typeof k === "string" && k) return k;
  } catch { /* variable absente ou illisible : clé héritée */ }
  console.warn("purge-chat : SUPABASE_SECRET_KEYS.default absente, repli sur la clé héritée");
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const jeton = req.headers.get("x-purge-jeton");
  if (!jeton) return Response.json({ erreur: "jeton requis" }, { status: 401 });
  // forme du jeton de Vault (32 octets en hex) : les déchets ne touchent pas la base
  if (!/^[0-9a-f]{64}$/.test(jeton)) return Response.json({ erreur: "jeton refusé" }, { status: 403 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, cleService(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const debut = Date.now();
  let retires = 0;
  let noms: string[] = [];
  do {
    const { data, error } = await sb.rpc("chat_a_purger", { jeton, lim: LOT });
    if (error) {
      // 42501 vient aussi d'un droit EXECUTE manquant : seul le message distingue le jeton refusé
      const refuse = error.code === "42501" && error.message === "jeton refusé";
      if (!refuse) console.error("purge-chat : rpc", error);
      return Response.json({ erreur: refuse ? "jeton refusé" : "échec", retires }, { status: refuse ? 403 : 500 });
    }
    noms = (data ?? []) as string[];
    if (noms.length === 0) break;
    const { data: partis, error: e2 } = await sb.storage.from("chat").remove(noms);
    if (e2) {
      console.error("purge-chat : remove", e2);
      return Response.json({ erreur: "échec", retires, demandes: noms.length }, { status: 500 });
    }
    retires += partis?.length ?? 0;
    if (!partis?.length) break; // rien n'est parti : ne pas relire les mêmes noms jusqu'au budget
  } while (noms.length === LOT && Date.now() - debut < BUDGET_MS);

  console.log(JSON.stringify({ retires }));
  return Response.json({ retires });
});
