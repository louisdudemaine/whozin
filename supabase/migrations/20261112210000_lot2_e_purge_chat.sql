-- Lot 2 — partie E : nettoyage du bucket privé « chat » (photos de messages et snaps).
-- Règle : un fichier se garde tant qu'il est la photo d'un message non expiré, ou celle d'un snap
-- pas encore ouvert (ou ouvert et encore dans ses 8 s). Sinon il part, 15 minutes au plus tôt après
-- son dépôt (marge pour une photo déposée juste avant l'insertion de son message).
-- Couvre : snap ouvert puis app fermée avant la fin des 8 s ; message éphémère purgé par
-- purge_ephemeral (la ligne private.snaps part avec son message en cascade : le chemin serait perdu) ;
-- envoi raté après le dépôt ; compte effacé (Loi 25 : ses photos de messages restaient stockées).
-- Supabase interdit l'effacement direct dans storage.objects (déclencheur protect_objects_delete) :
-- l'effacement passe par l'API Storage, dans la fonction Edge « purge-chat » (supabase/functions/purge-chat),
-- appelée par pg_cron toutes les 10 minutes. Seuls pg_cron et la base connaissent le jeton (Vault, jamais
-- affiché) : la fonction est joignable par tous, mais sans le bon jeton la base refuse et rien ne part.

create extension if not exists pg_net with schema extensions; -- ses fonctions vivent dans le schéma net

-- Jeton aléatoire, créé une seule fois, lu à l'exécution par pg_cron et par chat_a_purger.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'chat_purge_jeton') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'chat_purge_jeton',
                                'Jeton pg_cron -> fonction Edge purge-chat (lot 2, partie E)');
  end if;
end;
$$;

-- Recherche par chemin : sert ici et à chaque lecture du bucket (policy chat_select_member -> chat_object_ok).
create index if not exists messages_image_url_idx on public.messages (image_url) where image_url is not null;
create index if not exists snaps_image_url_idx on private.snaps (image_url);

-- Les fichiers à retirer, au plus « lim » par appel, les plus anciens d'abord. Réservée au rôle service
-- (la fonction Edge) ; refuse tout appel sans le jeton de Vault.
create or replace function public.chat_a_purger(jeton text, lim integer default 500)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare attendu text;
begin
  select decrypted_secret into attendu from vault.decrypted_secrets where name = 'chat_purge_jeton';
  if attendu is null or jeton is null or jeton <> attendu then
    raise exception 'jeton refusé' using errcode = '42501';
  end if;
  return array(
    select o.name
      from storage.objects o
     where o.bucket_id = 'chat'
       and not o.is_delete_marker  -- si le versionnage était un jour activé : ne pas relister les tombes
       and o.created_at < now() - interval '15 minutes'
       and not exists (select 1 from public.messages m
                        where m.image_url = o.name
                          and (m.expires_at is null or m.expires_at > now()))
       -- snap pas encore ouvert, ou ouvert et encore dans ses 8 s (le destinataire est en train de le charger)
       and not exists (select 1 from private.snaps s
                         join public.messages m on m.id = s.message_id
                        where s.image_url = o.name
                          and (m.opened_at is null or m.expires_at is null or m.expires_at > now()))
     order by o.created_at
     limit greatest(1, least(coalesce(lim, 500), 1000))
  );
end;
$$;
revoke all on function public.chat_a_purger(text, integer) from public, anon, authenticated;
grant execute on function public.chat_a_purger(text, integer) to service_role;

-- Toutes les 10 minutes. Le jeton est relu dans Vault à chaque exécution (il n'apparaît pas dans cron.job).
select cron.schedule(
  'purge-chat',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := 'https://aovuweoehzflydjtxpdr.supabase.co/functions/v1/purge-chat',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-purge-jeton', (select decrypted_secret from vault.decrypted_secrets where name = 'chat_purge_jeton')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
  $cron$
);

-- RETOUR ARRIÈRE : select cron.unschedule('purge-chat');
--                  drop function if exists public.chat_a_purger(text, integer);
--                  (l'index, l'extension et le jeton peuvent rester ; la fonction Edge se supprime au tableau de bord)
