// Purge du bucket privé « chat » (lot 2, partie E).
// La base désigne les fichiers à retirer (public.chat_a_purger) ; cette fonction les efface par l'API
// Storage, seule voie permise (Supabase bloque l'effacement direct dans storage.objects).
// Appelée par pg_cron toutes les 10 minutes avec le jeton de Vault (en-tête x-purge-jeton).
// ⚠️ DÉPLOYER SANS VÉRIFICATION DE JWT (`supabase functions deploy purge-chat --no-verify-jwt`, ou
// verify_jwt: false) : pg_cron n'envoie pas de JWT, la passerelle répondrait 401 et rien ne partirait.
// Sans le bon jeton, chat_a_purger refuse et rien n'est retiré.
import { createClient } from "jsr:@supabase/supabase-js@2";

const LOT = 500;
const BUDGET_MS = 20_000; // sous le délai de 30 s de l'appel pg_net

/** Nouvelle clé secrète (SUPABASE_SECRET_KEYS) d'abord ; l'ancienne clé service_role cesse à la fin de 2026. */
function cleService(): string {
  try {
    const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")?.default;
    if (typeof k === "string" && k) return k;
  } catch { /* variable absente ou illisible : clé héritée */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const jeton = req.headers.get("x-purge-jeton");
  if (!jeton) return Response.json({ erreur: "jeton requis" }, { status: 401 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, cleService(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const debut = Date.now();
  let retires = 0;
  let noms: string[] = [];
  do {
    const { data, error } = await sb.rpc("chat_a_purger", { jeton, lim: LOT });
    if (error) {
      const refuse = error.code === "42501";
      return Response.json({ erreur: refuse ? "jeton refusé" : error.message, retires }, { status: refuse ? 403 : 500 });
    }
    noms = (data ?? []) as string[];
    if (noms.length === 0) break;
    const { data: partis, error: e2 } = await sb.storage.from("chat").remove(noms);
    if (e2) return Response.json({ erreur: e2.message, retires, demandes: noms.length }, { status: 500 });
    retires += partis?.length ?? 0;
  } while (noms.length === LOT && Date.now() - debut < BUDGET_MS);

  return Response.json({ retires });
});
