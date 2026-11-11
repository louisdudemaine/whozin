-- Portes ouvertes, lot 1 — partie B : ce qui RESTREINT.
-- À appliquer APRÈS le déploiement du code qui lit sa fiche par my_profile(), la fiche d'un
-- autre par la liste de colonnes publiques, et qui écrit la date de naissance par set_birthdate().

-- B1. Sans connexion : aucun droit de table. Aucun écran d'avant connexion ne lit la base ;
--     le widget des lieux passe par place_widget (definer), qui garde son droit d'exécution.
revoke all on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
revoke execute on function public.can_see_post(uuid) from anon;
revoke execute on function public.places_nearby(double precision, double precision, integer) from anon;

alter policy profiles_select_all on public.profiles to authenticated;
alter policy follows_select_all on public.follows to authenticated;
alter policy dating_profiles_select on public.dating_profiles to authenticated;
alter policy stories_select_visible on public.stories to authenticated;
alter policy posts_select_visible on public.posts to authenticated;
alter policy likes_select_visible on public.likes to authenticated;
alter policy comments_select_visible on public.comments to authenticated;
alter policy places_select_all on public.places to authenticated;

-- B2. profiles : un autre compte ne lit que la liste blanche (celle de PROFILE_COLS dans le code).
--     birthdate, location_sharing, interests, pro_*, ring_skin, onboarded ne se lisent que par
--     my_profile(). Toute colonne ajoutée plus tard est privée par défaut.
--     En écriture : birthdate (une fois, par set_birthdate) et ring_skin (par claim_drop) ne sont
--     plus modifiables directement.
revoke select, update on public.profiles from authenticated;
grant select (id, username, display_name, avatar_url, bio, created_at)
  on public.profiles to authenticated;
grant update (username, display_name, avatar_url, bio, location_sharing,
              pro_mode, pro_title, pro_company, pro_linkedin, pro_industry, pro_goals,
              interests, onboarded)
  on public.profiles to authenticated;

-- B3. is_adult(uid) n'est plus appelable : les policies passent par private.i_am_adult().
revoke execute on function public.is_adult(uuid) from public, anon, authenticated;

-- B4. Check-ins et balises : le client ne fixe plus ni l'heure de début, ni l'expiration, ni la
--     conversation rattachée. (Un check-in couvrant dix ans recoupait l'historique de chacun ;
--     une balise pointant une conversation y faisait entrer un complice.)
revoke insert, update on public.check_ins from authenticated;
grant insert (user_id, place_id, message, lat, lng, spotify_url) on public.check_ins to authenticated;
revoke insert, update on public.beacons from authenticated;
grant insert (user_id, message) on public.beacons to authenticated;

-- B5. Portail partenaire : plus de revendication en libre-service (elle donnait les réservations
--     du lieu en lecture et en écriture). Un gestionnaire est inscrit par l'administrateur.
--     Réservations : le client ne peut plus confirmer la sienne ni en réécrire le contenu.
drop policy if exists place_partners_claim on public.place_partners;
revoke insert, update on public.place_partners from authenticated;

alter policy reservations_update_partner on public.reservations
  with check (
    status = any (array['confirmed'::text, 'declined'::text])
    and exists (
      select 1 from public.place_partners pp
      where pp.place_id = reservations.place_id and pp.user_id = auth.uid()
    )
  );
revoke update on public.reservations from authenticated;
grant update (status) on public.reservations to authenticated;

notify pgrst, 'reload schema';

-- RETOUR ARRIÈRE d'urgence (rouvre ce que B ferme, dans cet ordre) :
-- grant select, update on public.profiles to authenticated;
-- grant insert, update on public.check_ins, public.beacons, public.place_partners to authenticated;
-- grant update on public.reservations to authenticated;
-- grant execute on function public.is_adult(uuid) to authenticated;
-- create policy place_partners_claim on public.place_partners for insert to authenticated
--   with check (user_id = auth.uid());
