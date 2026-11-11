-- Lot 2 — partie D : ce qui RESTREINT.
-- CONDITION DE DÉPLOIEMENT : la partie C est appliquée ET le nouveau code web est en production (Vercel, main),
-- c'est-à-dire :
--   * fetchRsvpInfo lit le total par event_rsvp_counts() et sa propre réponse par .eq("user_id", meId) ;
--   * les photos de messages et les snaps partent dans le bucket privé « chat » (uploadChatPhoto) ;
--   * le champ « nom affiché » est borné à 50 caractères et l'échec de saveProfile s'affiche.
-- Le build mobile 9 n'est touché par rien ici (il n'envoie ni photo, ni nom affiché, ni RSVP).
-- Vérifier juste avant (doit rendre 0) : aucune photo de message encore dans le bucket media.
--   select count(*) from public.messages where image_url like 'https://%';
--   select count(*) from private.snaps where image_url like 'https://%';
-- Sinon, traiter ces lignes d'abord : l'ajout de la contrainte échouerait (exprès) et rien ne changerait.

-- D1. Événements : chacun ne lit plus que SA réponse ; le total passe par event_rsvp_counts().
alter policy event_rsvps_select on public.event_rsvps
  to authenticated
  using (user_id = auth.uid());

-- D2. Photos de messages et snaps : seulement un chemin du bucket privé « chat »
--     (<conversation>/<expéditeur>/<fichier>). Fin de la transition par le bucket public media.
create or replace function private.message_image_ok(u text, conv uuid, sender uuid)
returns boolean
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select u is null
      or u ~ ('^' || conv::text || '/' || sender::text || '/[A-Za-z0-9._-]+$');
$$;
revoke all on function private.message_image_ok(text, uuid, uuid) from public, anon;
grant execute on function private.message_image_ok(text, uuid, uuid) to authenticated, service_role;

-- Contrainte reposée pour être revalidée sur toutes les lignes (une fonction modifiée ne revalide rien).
-- VALIDÉE exprès : une ligne fautive ferait échouer mark_conversation_read pour toute la conversation.
alter table public.messages drop constraint if exists messages_image_url_source;
alter table public.messages add constraint messages_image_url_source
  check (private.message_image_ok(image_url, conversation_id, sender_id));

-- D3. Nom affiché borné et « whozin » réservé à l'app : sans cela, le titre attribué des push
--     (« <nom> · … ») n'empêche pas un compte nommé « Whozin · Sécurité ». Données actuelles conformes.
-- ponytail: liste noire naïve (« Wh0zin » passe) ; gabarits de titre fixés côté serveur si ça compte.
alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_check
  check (display_name is null
         or (char_length(display_name) <= 50 and position('whozin' in lower(display_name)) = 0));
alter table public.profiles drop constraint if exists profiles_username_reserved_check;
alter table public.profiles add constraint profiles_username_reserved_check
  check (position('whozin' in lower(username)) = 0);

notify pgrst, 'reload schema';

-- RETOUR ARRIÈRE d'urgence (rouvre ce que D ferme ; la partie C reste en place) :
-- alter policy event_rsvps_select on public.event_rsvps to authenticated using (true);
-- create or replace function private.message_image_ok(u text, conv uuid, sender uuid)
--   returns boolean language sql immutable security definer set search_path = public, pg_temp as $$
--   select u is null
--       or u ~ ('^' || conv::text || '/' || sender::text || '/[A-Za-z0-9._-]+$')
--       or u ~ ('^https://aovuweoehzflydjtxpdr\.supabase\.co/storage/v1/object/public/media/'
--               || sender::text || '/[A-Za-z0-9._-]+$');
--   $$;
-- alter table public.profiles drop constraint if exists profiles_display_name_check;
-- alter table public.profiles drop constraint if exists profiles_username_reserved_check;
-- notify pgrst, 'reload schema';
