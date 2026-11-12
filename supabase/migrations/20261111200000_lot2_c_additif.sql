-- Lot 2 — partie C : ce qui S'AJOUTE ou se resserre sans casser aucun appel actuel.
-- Compatible avec le code web de main (5cc57e2) ET avec le build mobile 9 : chaque appelant a été relu
-- (voir lot2/plan.md). La partie D (restrictive) ne s'applique qu'après le déploiement du nouveau code web.
-- Une seule définition par objet : quand deux domaines réécrivaient la même fonction ou policy, le texte
-- ci-dessous fusionne les deux changements.

-- =====================================================================================
-- 0. Hygiène des droits
-- =====================================================================================

-- Le « revoke ... from anon » du lot 1 laissait le droit de PUBLIC : on le retire, authenticated garde le sien.
revoke execute on function public.places_nearby(double precision, double precision, integer) from public, anon;
grant execute on function public.places_nearby(double precision, double precision, integer) to authenticated;
revoke execute on function public.can_see_post(uuid) from public, anon;
grant execute on function public.can_see_post(uuid) to authenticated;

-- Les fonctions créées plus tard par postgres ne s'ouvrent plus d'office à anon : le droit venait de
-- PUBLIC (défaut global, que la règle propre au schéma ne peut pas retirer) et d'anon (règle du schéma).
-- authenticated garde son droit par défaut dans public. Chaque fonction de ce fichier reçoit ses droits
-- explicitement ; toute migration future doit faire de même.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- TRUNCATE ne sert à aucun client (PostgREST ne l'expose pas) : retiré par principe.
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate on tables from anon, authenticated;

-- =====================================================================================
-- 1. Socle « qui voit le check-in de qui » (policy, Realtime et fonctions definer)
-- =====================================================================================

-- Instantané du mode au moment du check-in : un check-in fait en mode Caché ne ressort jamais,
-- même si l'auteur repasse visible. Le client ne peut pas écrire la colonne (INSERT par colonne, lot 1).
alter table public.check_ins add column if not exists hidden boolean not null default false;

create or replace function private.stamp_check_in()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.hidden := not private.shares_location(new.user_id);
  -- Cohérence (pas une correction de sécurité) : la position d'un check-in est celle du LIEU.
  select p.lat, p.lng into new.lat, new.lng from public.places p where p.id = new.place_id;
  return new;
end;
$$;
revoke all on function private.stamp_check_in() from public, anon, authenticated;

drop trigger if exists trg_stamp_check_in on public.check_ins;
create trigger trg_stamp_check_in
  before insert on public.check_ins
  for each row execute function private.stamp_check_in();

-- Règle des fonctions definer. AUCUN droit client : viewer est libre, ce serait un oracle
-- « X est-il caché ou bloqué avec Y ». viewer null = agrégat anonyme ou tâche planifiée.
-- ponytail: un appel definer par ligne ; dénormaliser la visibilité si le volume monte.
create or replace function private.sees_check_in(viewer uuid, author uuid, made_hidden boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not coalesce(made_hidden, false)
    and private.shares_location(author)
    and (viewer is null or not public.blocked_between(viewer, author));
$$;
revoke all on function private.sees_check_in(uuid, uuid, boolean) from public, anon, authenticated;

-- Aides des policies : auth.uid() est TOUJOURS une des deux parties (pas d'oracle sur une paire de tiers).
create or replace function private.blocked_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other and blocked_id = auth.uid())
  );
$$;
revoke all on function private.blocked_with(uuid) from public, anon;
grant execute on function private.blocked_with(uuid) to authenticated;

create or replace function private.mutual_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.follows where follower_id = auth.uid() and following_id = other)
     and exists (select 1 from public.follows where follower_id = other and following_id = auth.uid());
$$;
revoke all on function private.mutual_with(uuid) from public, anon;
grant execute on function private.mutual_with(uuid) to authenticated;

alter policy check_ins_select_visible on public.check_ins
  to authenticated
  using (
    user_id = auth.uid()
    or (expires_at > now() and not hidden
        and private.shares_location(user_id)
        and not private.blocked_with(user_id))
  );

-- Passer en Caché met fin aux check-ins en cours (et efface la position de proximité).
create or replace function private.end_presence_on_hide()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.check_ins set expires_at = now() where user_id = new.id and expires_at > now();
  delete from public.live_positions where user_id = new.id;
  return null;
end;
$$;
revoke all on function private.end_presence_on_hide() from public, anon, authenticated;

drop trigger if exists trg_end_presence_on_hide on public.profiles;
create trigger trg_end_presence_on_hide
  after update of location_sharing on public.profiles
  for each row
  when (new.location_sharing = 'hidden' and old.location_sharing is distinct from 'hidden')
  execute function private.end_presence_on_hide();

-- =====================================================================================
-- 2. Graphe social : « ami » = suivi MUTUEL, blocage respecté partout
-- =====================================================================================

alter policy posts_select_visible on public.posts
  to authenticated
  using (
    user_id = auth.uid()
    or (
      (visibility = 'public' or (visibility = 'friends' and private.mutual_with(user_id)))
      and not private.blocked_with(user_id)
    )
  );

alter policy beacons_select_friends on public.beacons
  to authenticated
  using (
    user_id = auth.uid()
    or (expires_at > now() and private.mutual_with(user_id) and not private.blocked_with(user_id))
  );

alter policy stories_select_visible on public.stories
  to authenticated
  using (
    user_id = auth.uid()
    or (expires_at > now() and not private.blocked_with(user_id))
  );

-- Qui a répondu à une balise : pas un compte avec qui il y a un blocage.
alter policy beacon_responses_select on public.beacon_responses
  to authenticated
  using (
    exists (select 1 from public.beacons b where b.id = beacon_responses.beacon_id)
    and (user_id = auth.uid() or not private.blocked_with(user_id))
  );

-- moves : soi-même seulement ; les amis passent par friends_moves() (definer, mutuel + blocage).
alter policy moves_select on public.moves
  to authenticated
  using (user_id = auth.uid());

-- Suivre : refusé s'il existe un blocage, dans un sens ou dans l'autre.
alter policy follows_insert_own on public.follows
  to authenticated
  with check (follower_id = auth.uid() and not private.blocked_with(following_id));

-- Rencontres : la table ne se lit que pour SA ligne ; les autres inscrits passent par dating_candidates.
alter policy dating_profiles_select on public.dating_profiles
  to authenticated
  using (user_id = auth.uid());

-- can_see_post reste SECURITY INVOKER exprès : la lecture de posts passe par posts_select_visible,
-- qui décide seule (elle redisait la règle « amis » à sens unique).
create or replace function public.can_see_post(p_post_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.posts p where p.id = p_post_id);
$$;
revoke all on function public.can_see_post(uuid) from public, anon;
grant execute on function public.can_see_post(uuid) to authenticated;

-- dm_blocked (appelée par la policy messages_insert_sender) ne répond plus qu'à un participant.
create or replace function public.dm_blocked(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv and not c.is_group
      and c.user_a is not null and c.user_b is not null
      and public.is_conversation_participant(conv)
      and public.blocked_between(c.user_a, c.user_b)
  );
$$;
revoke all on function public.dm_blocked(uuid) from public, anon;
grant execute on function public.dm_blocked(uuid) to authenticated;

-- Plus d'appel direct sur une paire quelconque : seules les fonctions definer (propriétaire postgres)
-- les utilisent ; les policies passent par private.blocked_with / private.mutual_with.
revoke execute on function public.blocked_between(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_mutual_friend(uuid, uuid) from public, anon, authenticated;

-- Bloquer retire les abonnements dans les deux sens et éteint un lien de gardien actif.
create or replace function private.unfollow_on_block()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  update public.guardian_links set active_until = now()
  where active_until > now()
    and ((user_id = new.blocker_id and guardian_id = new.blocked_id)
      or (user_id = new.blocked_id and guardian_id = new.blocker_id));
  return new;
end;
$$;
revoke all on function private.unfollow_on_block() from public, anon, authenticated;

drop trigger if exists trg_unfollow_on_block on public.blocks;
create trigger trg_unfollow_on_block
  after insert on public.blocks
  for each row execute function private.unfollow_on_block();

-- Blocages déjà présents (0 le 2026-11-11) : même invariant tout de suite.
delete from public.follows f
using public.blocks b
where (f.follower_id = b.blocker_id and f.following_id = b.blocked_id)
   or (f.follower_id = b.blocked_id and f.following_id = b.blocker_id);

-- Notifications : une « X te suit » par 24 h, une « X aime ton post » par post.
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.notifications n
    where n.user_id = new.following_id and n.actor_id = new.follower_id
      and n.type = 'follow' and n.created_at > now() - interval '24 hours'
  ) then
    insert into public.notifications (user_id, actor_id, type)
    values (new.following_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$$;
revoke all on function public.notify_on_follow() from public, anon, authenticated;

create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare author uuid;
begin
  select user_id into author from public.posts where id = new.post_id;
  if author is not null and author <> new.user_id
     and not exists (
       select 1 from public.notifications n
       where n.user_id = author and n.actor_id = new.user_id
         and n.type = 'like' and n.post_id = new.post_id
     ) then
    insert into public.notifications (user_id, actor_id, type, post_id)
    values (author, new.user_id, 'like', new.post_id);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_on_like() from public, anon, authenticated;

-- =====================================================================================
-- 3. Co-présence : chaque fonction applique la règle du socle (Caché maintenant, Caché à l'époque, blocage)
-- =====================================================================================

create or replace function public.seen_irl(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.check_ins a
    join public.check_ins b
      on b.place_id = a.place_id and b.user_id = other
     and tstzrange(a.created_at, a.expires_at) && tstzrange(b.created_at, b.expires_at)
    where a.user_id = auth.uid()
      and private.sees_check_in(auth.uid(), b.user_id, b.hidden)
  );
$$;
revoke all on function public.seen_irl(uuid) from public, anon;
grant execute on function public.seen_irl(uuid) to authenticated;

create or replace function public.my_crew()
returns table(user_id uuid, username text, display_name text, avatar_url text, outings integer, top_place text, last_at timestamp with time zone)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with co as (
    select ci2.user_id as buddy, ci1.place_id,
      greatest(ci1.created_at, ci2.created_at) as at,
      date_trunc('day', greatest(ci1.created_at, ci2.created_at) at time zone 'America/Montreal') as night
    from public.check_ins ci1
    join public.check_ins ci2
      on ci2.place_id = ci1.place_id and ci2.user_id <> ci1.user_id
     and tstzrange(ci1.created_at, ci1.expires_at) && tstzrange(ci2.created_at, ci2.expires_at)
    where ci1.user_id = auth.uid() and ci1.created_at > now() - interval '60 days'
      and private.sees_check_in(auth.uid(), ci2.user_id, ci2.hidden)
  ),
  agg as (
    select buddy,
      count(distinct night)::int as outings,
      max(at) as last_at,
      (select pl.name from co c2 join public.places pl on pl.id = c2.place_id
        where c2.buddy = co.buddy group by pl.name order by count(*) desc limit 1) as top_place
    from co group by buddy
  )
  select p.id, p.username, p.display_name, p.avatar_url, a.outings, a.top_place, a.last_at
  from agg a join public.profiles p on p.id = a.buddy
  where a.outings >= 2
  order by a.outings desc, a.last_at desc
  limit 6;
$$;
revoke all on function public.my_crew() from public, anon;
grant execute on function public.my_crew() to authenticated;

create or replace function public.night_recap()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  loc_now timestamp := now() at time zone 'America/Montreal';
  night_start timestamptz;
  night_end timestamptz;
  result jsonb;
begin
  if me is null then raise exception 'auth requise'; end if;
  night_start := ((loc_now::date - case when extract(hour from loc_now) < 17 then 1 else 0 end)
                 + time '17:00') at time zone 'America/Montreal';
  night_end := least(now(), night_start + interval '14 hours');

  with my_stops as (
    select ci.id, ci.created_at, ci.expires_at, pl.name, pl.category
    from public.check_ins ci join public.places pl on pl.id = ci.place_id
    where ci.user_id = me and ci.created_at >= night_start and ci.created_at < night_end
    order by ci.created_at
  ),
  crossed as (
    select distinct on (ci2.user_id)
      p.username, p.display_name, p.avatar_url, pl.name as place_name
    from public.check_ins ci1
    join public.check_ins ci2
      on ci2.place_id = ci1.place_id and ci2.user_id <> me
     and tstzrange(ci1.created_at, ci1.expires_at) && tstzrange(ci2.created_at, ci2.expires_at)
    join public.profiles p on p.id = ci2.user_id
    join public.places pl on pl.id = ci1.place_id
    where ci1.user_id = me and ci1.created_at >= night_start and ci1.created_at < night_end
      and private.sees_check_in(me, ci2.user_id, ci2.hidden)
    order by ci2.user_id
    limit 6
  ),
  likes_in as (
    select count(*) n from public.likes l
    join public.posts po on po.id = l.post_id
    where po.user_id = me and l.user_id <> me
      and l.created_at >= night_start and l.created_at < night_end
  ),
  posts_in as (
    select count(*) n from public.posts where user_id = me
      and created_at >= night_start and created_at < night_end
  ),
  matches_in as (
    select count(*) n from public.dating_likes a
    join public.dating_likes b on b.from_user = a.to_user and b.to_user = a.from_user
    where a.from_user = me and greatest(a.created_at, b.created_at) >= night_start
      and greatest(a.created_at, b.created_at) < night_end
  )
  select jsonb_build_object(
    'night_start', night_start,
    'night_end', night_end,
    'stops', coalesce((select jsonb_agg(jsonb_build_object(
        'name', s.name, 'category', s.category, 'at', s.created_at) order by s.created_at)
      from my_stops s), '[]'::jsonb),
    'crossed', coalesce((select jsonb_agg(jsonb_build_object(
        'username', c.username, 'display_name', c.display_name,
        'avatar_url', c.avatar_url, 'place_name', c.place_name))
      from crossed c), '[]'::jsonb),
    'likes', (select n from likes_in),
    'posts', (select n from posts_in),
    'matches', (select n from matches_in)
  ) into result;
  return result;
end;
$$;
revoke all on function public.night_recap() from public, anon;
grant execute on function public.night_recap() to authenticated;

-- Fusion co-présence (règle de visibilité des check-ins) + rencontres (il faut être inscrit pour voir la pile).
create or replace function public.dating_candidates(lim integer default 30)
returns table(id uuid, username text, display_name text, avatar_url text, bio text, vibe text, age integer, compat numeric, crossed_place text, crossed_emoji text, crossed_at timestamp with time zone)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid),
  my_likes as (select post_id from public.likes where user_id = (select uid from me)),
  co as (
    select l.user_id as uid, count(*)::numeric n from public.likes l
    where l.post_id in (select post_id from my_likes) and l.user_id <> (select uid from me)
    group by l.user_id
  ),
  my_cat as (
    select category, sum(w)::numeric c from (
      select pl.category, 1 w from public.likes l
        join public.posts p on p.id=l.post_id join public.places pl on pl.id=p.place_id where l.user_id=(select uid from me)
      union all
      select pl.category, 1 from public.check_ins ci join public.places pl on pl.id=ci.place_id where ci.user_id=(select uid from me)
    ) s group by category
  ),
  their_cat as (
    select uid, category, sum(w)::numeric c from (
      select l.user_id uid, pl.category, 1 w from public.likes l
        join public.posts p on p.id=l.post_id join public.places pl on pl.id=p.place_id where l.user_id<>(select uid from me)
      union all
      select ci.user_id, pl.category, 1 from public.check_ins ci join public.places pl on pl.id=ci.place_id
      where ci.user_id<>(select uid from me)
        and private.sees_check_in(null, ci.user_id, ci.hidden)
    ) s group by uid, category
  ),
  taste as (select tc.uid, sum(least(mc.c, tc.c))::numeric n from their_cat tc join my_cat mc using(category) group by tc.uid),
  crossed as (
    select distinct on (ci2.user_id)
      ci2.user_id as uid, pl.name as place_name, pl.category as place_cat,
      greatest(ci1.created_at, ci2.created_at) as at
    from public.check_ins ci1
    join public.check_ins ci2
      on ci2.place_id = ci1.place_id and ci2.user_id <> ci1.user_id
     and tstzrange(ci1.created_at, ci1.expires_at) && tstzrange(ci2.created_at, ci2.expires_at)
    join public.places pl on pl.id = ci1.place_id
    where ci1.user_id = (select uid from me) and ci1.created_at > now() - interval '30 days'
      and private.sees_check_in((select uid from me), ci2.user_id, ci2.hidden)
    order by ci2.user_id, greatest(ci1.created_at, ci2.created_at) desc
  )
  select p.id, p.username, p.display_name, p.avatar_url, p.bio, d.vibe,
    extract(year from age(p.birthdate))::int as age,
    (2*coalesce(co.n,0) + coalesce(taste.n,0) + case when cr.uid is not null then 5 else 0 end) as compat,
    cr.place_name,
    case cr.place_cat
      when 'bar' then '🍻' when 'restaurant' then '🍽️' when 'cafe' then '☕'
      when 'club' then '🪩' when 'festival' then '🎪' when 'concert' then '🎶'
      when 'sport' then '🏟️' when 'park' then '🌳' when 'event' then '🎉' else '📍'
    end,
    cr.at
  from public.profiles p
  join public.dating_profiles d on d.user_id = p.id
  left join co on co.uid = p.id
  left join taste on taste.uid = p.id
  left join crossed cr on cr.uid = p.id
  where d.enabled
    and p.id <> (select uid from me)
    and exists (select 1 from public.dating_profiles md where md.user_id = (select uid from me) and md.enabled) -- moi inscrit
    and public.is_adult((select uid from me))   -- moi majeur
    and public.is_adult(p.id)                   -- candidat majeur
    and not exists (select 1 from public.dating_likes l where l.from_user=(select uid from me) and l.to_user=p.id)
    and not public.blocked_between((select uid from me), p.id)
  order by (cr.uid is not null) desc, compat desc, random() limit lim;
$$;
revoke all on function public.dating_candidates(integer) from public, anon;
grant execute on function public.dating_candidates(integer) to authenticated;

-- Fusion co-présence (crew et lieu chaud filtrés) + graphe social (balise d'un ami MUTUEL seulement).
create or replace function public.for_you_now()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); result jsonb;
begin
  if me is null then raise exception 'auth requise'; end if;

  with
  -- 1) MOVES de mes amis mutuels (intention déclarée = signal le plus chaud)
  moves_sig as (
    select jsonb_build_object(
      'kind', 'move', 'emoji', coalesce(m.emoji, '🌃'),
      'title', coalesce(p.display_name, p.username),
      'subtitle', m.body,
      'href', '/messages',
      'username', p.username,
      'avatar_url', p.avatar_url,
      'score', 100 - extract(epoch from (now() - m.created_at)) / 600
    ) j
    from public.moves m
    join public.profiles p on p.id = m.user_id
    where m.expires_at > now() and m.user_id <> me
      and exists (select 1 from public.follows f where f.follower_id = me and f.following_id = m.user_id)
      and exists (select 1 from public.follows f2 where f2.follower_id = m.user_id and f2.following_id = me)
      and not public.blocked_between(me, m.user_id)
  ),
  -- 2) Mon CREW est dehors MAINTENANT (co-présences récurrentes + check-in actif), mêmes règles que la carte
  crew_buddies as (
    select ci2.user_id as uid, count(distinct date_trunc('day', greatest(ci1.created_at, ci2.created_at) at time zone 'America/Montreal')) n
    from public.check_ins ci1
    join public.check_ins ci2 on ci2.place_id = ci1.place_id and ci2.user_id <> ci1.user_id
      and tstzrange(ci1.created_at, ci1.expires_at) && tstzrange(ci2.created_at, ci2.expires_at)
    where ci1.user_id = me and ci1.created_at > now() - interval '60 days'
      and private.sees_check_in(me, ci2.user_id, ci2.hidden)
    group by ci2.user_id having count(distinct date_trunc('day', greatest(ci1.created_at, ci2.created_at) at time zone 'America/Montreal')) >= 2
  ),
  crew_sig as (
    select jsonb_build_object(
      'kind', 'crew', 'emoji', '👯',
      'title', coalesce(p.display_name, p.username) || (case when fr_cnt.c > 1 then ' +' || (fr_cnt.c - 1) else '' end),
      'subtitle', 'Ton crew est sorti · ' || pl.name,
      'href', '/map',
      'username', p.username, 'avatar_url', p.avatar_url,
      'score', 85
    ) j
    from (
      select ci.user_id, ci.place_id, max(ci.created_at) at_, count(*) over () c
      from public.check_ins ci
      join crew_buddies cb on cb.uid = ci.user_id
      where ci.expires_at > now() and private.sees_check_in(me, ci.user_id, ci.hidden)
      group by ci.user_id, ci.place_id
      order by max(ci.created_at) desc limit 1
    ) fr_cnt
    join public.profiles p on p.id = fr_cnt.user_id
    join public.places pl on pl.id = fr_cnt.place_id
  ),
  -- 3) Le LIEU qui décolle : personnes que JE peux voir sur place (moi compris)
  hot_sig as (
    select jsonb_build_object(
      'kind', 'hot', 'emoji', '🔥',
      'title', pl.name,
      'subtitle', cnt || ' personne' || (case when cnt > 1 then 's' else '' end) || ' sur place · ça décolle',
      'href', '/map', 'score', 70 + least(cnt, 20)
    ) j
    from (
      select ci.place_id, count(distinct ci.user_id) cnt from public.check_ins ci
      where ci.expires_at > now()
        and (ci.user_id = me or private.sees_check_in(me, ci.user_id, ci.hidden))
      group by ci.place_id order by count(distinct ci.user_id) desc limit 1
    ) top
    join public.places pl on pl.id = top.place_id
    where top.cnt >= 2
  ),
  -- 4) Une BALISE active d'un ami MUTUEL (même règle que active_beacons et la policy de beacons)
  beacon_sig as (
    select jsonb_build_object(
      'kind', 'beacon', 'emoji', '🔦',
      'title', coalesce(p.display_name, p.username),
      'subtitle', 'a lancé une balise — rejoins',
      'href', '/feed', 'username', p.username, 'avatar_url', p.avatar_url, 'score', 80
    ) j
    from public.beacons b join public.profiles p on p.id = b.user_id
    where b.expires_at > now() and b.user_id <> me and not public.blocked_between(me, b.user_id)
      and public.is_mutual_friend(me, b.user_id)
    order by b.created_at desc limit 1
  ),
  all_sig as (
    select j from moves_sig
    union all select j from crew_sig
    union all select j from hot_sig
    union all select j from beacon_sig
  )
  select coalesce(jsonb_agg(j order by (j->>'score')::numeric desc), '[]'::jsonb)
  into result
  from (select j from all_sig limit 6) s;

  return result;
end;
$$;
revoke all on function public.for_you_now() from public, anon;
grant execute on function public.for_you_now() to authenticated;

-- Tâche planifiée (cron proactive-scan, rôle postgres) : aucun droit client.
create or replace function public.proactive_scan()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer := 0;
begin
  -- 1) MOVE d'un ami mutuel posté dans les 12 dernières minutes
  with fresh_moves as (
    select m.user_id as actor, f.follower_id as target
    from public.moves m
    join public.follows f on f.following_id = m.user_id
    join public.follows f2 on f2.follower_id = m.user_id and f2.following_id = f.follower_id
    where m.created_at > now() - interval '12 minutes' and m.expires_at > now()
      and not public.blocked_between(f.follower_id, m.user_id)
  ),
  ins_moves as (
    insert into public.notifications (user_id, actor_id, type, read)
    select fm.target, fm.actor, 'move', false from fresh_moves fm
    where not exists (
      select 1 from public.notifications nx
      where nx.user_id = fm.target and nx.actor_id = fm.actor and nx.type = 'move'
        and nx.created_at > now() - interval '3 hours'
    )
    returning 1
  )
  select count(*) into n from ins_moves;

  -- 2) un membre du CREW vient de faire un check-in VISIBLE (≤12 min), pour ceux avec qui j'ai ≥2 sorties
  with co as (
    select ci1.user_id as me, ci2.user_id as buddy,
      count(distinct date_trunc('day', greatest(ci1.created_at, ci2.created_at) at time zone 'America/Montreal')) nights
    from public.check_ins ci1
    join public.check_ins ci2 on ci2.place_id = ci1.place_id and ci2.user_id <> ci1.user_id
      and tstzrange(ci1.created_at, ci1.expires_at) && tstzrange(ci2.created_at, ci2.expires_at)
    where ci1.created_at > now() - interval '60 days'
      and private.sees_check_in(ci1.user_id, ci2.user_id, ci2.hidden)
    group by ci1.user_id, ci2.user_id
    having count(distinct date_trunc('day', greatest(ci1.created_at, ci2.created_at) at time zone 'America/Montreal')) >= 2
  ),
  fresh_checkins as (
    select co.me as target, ci.user_id as actor
    from public.check_ins ci
    join co on co.buddy = ci.user_id
    where ci.created_at > now() - interval '12 minutes' and ci.expires_at > now()
      and private.sees_check_in(co.me, ci.user_id, ci.hidden)
  ),
  ins_crew as (
    insert into public.notifications (user_id, actor_id, type, read)
    select distinct fc.target, fc.actor, 'crew_out', false from fresh_checkins fc
    where not exists (
      select 1 from public.notifications nx
      where nx.user_id = fc.target and nx.actor_id = fc.actor and nx.type = 'crew_out'
        and nx.created_at > now() - interval '3 hours'
    )
    returning 1
  )
  select n + count(*) into n from ins_crew;

  return n;
end;
$$;
revoke all on function public.proactive_scan() from public, anon, authenticated;

create or replace function public.place_memory(p_place uuid)
returns table(last_at timestamp with time zone, with_names text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with mine as (
    select * from public.check_ins
    where user_id = auth.uid() and place_id = p_place and created_at < now() - interval '12 hours'
    order by created_at desc limit 1
  )
  select m.created_at,
    coalesce(
      (select array_agg(distinct coalesce(p.display_name, p.username))
       from public.check_ins c
       join public.profiles p on p.id = c.user_id
       where c.place_id = p_place and c.user_id <> auth.uid()
         and tstzrange(c.created_at, c.expires_at) && tstzrange(m.created_at, m.expires_at)
         and public.is_mutual_friend(auth.uid(), c.user_id)
         and private.sees_check_in(auth.uid(), c.user_id, c.hidden)),
      '{}'
    )
  from mine m;
$$;
revoke all on function public.place_memory(uuid) from public, anon;
grant execute on function public.place_memory(uuid) to authenticated;

create or replace function public.suggested_people(lim integer default 12)
returns table(id uuid, username text, display_name text, avatar_url text, bio text, reason text, shared integer, score numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid),
  my_likes as (select post_id from public.likes where user_id = (select uid from me)),
  co as (
    select l.user_id as uid, count(*)::numeric as n
    from public.likes l
    where l.post_id in (select post_id from my_likes) and l.user_id <> (select uid from me)
    group by l.user_id
  ),
  my_cat as (
    select category, sum(w)::numeric as c from (
      select pl.category, 1 as w from public.likes l
        join public.posts p on p.id = l.post_id join public.places pl on pl.id = p.place_id
        where l.user_id = (select uid from me)
      union all
      select pl.category, 1 from public.check_ins ci
        join public.places pl on pl.id = ci.place_id where ci.user_id = (select uid from me)
    ) s group by category
  ),
  their_cat as (
    select uid, category, sum(w)::numeric as c from (
      select l.user_id as uid, pl.category, 1 as w from public.likes l
        join public.posts p on p.id = l.post_id join public.places pl on pl.id = p.place_id
        where l.user_id <> (select uid from me)
      union all
      select ci.user_id, pl.category, 1 from public.check_ins ci
        join public.places pl on pl.id = ci.place_id
        where ci.user_id <> (select uid from me)
          and private.sees_check_in(null, ci.user_id, ci.hidden)
    ) s group by uid, category
  ),
  taste as (
    select tc.uid, sum(least(mc.c, tc.c))::numeric as n
    from their_cat tc join my_cat mc using (category) group by tc.uid
  ),
  fof as (
    select f2.following_id as uid, count(*)::numeric as n
    from public.follows f1 join public.follows f2 on f1.following_id = f2.follower_id
    where f1.follower_id = (select uid from me) and f2.following_id <> (select uid from me)
    group by f2.following_id
  ),
  scored as (
    select u.uid,
      coalesce(co.n,0) co_n, coalesce(taste.n,0) taste_n, coalesce(fof.n,0) fof_n,
      (3*coalesce(co.n,0) + 2*coalesce(taste.n,0) + 1.5*coalesce(fof.n,0)) as score
    from (select uid from co union select uid from taste union select uid from fof) u
    left join co using (uid) left join taste using (uid) left join fof using (uid)
  )
  select p.id, p.username, p.display_name, p.avatar_url, p.bio,
    case when s.co_n >= s.taste_n and s.co_n >= s.fof_n and s.co_n > 0 then 'co_likes'
         when s.taste_n >= s.fof_n and s.taste_n > 0 then 'shared_taste'
         when s.fof_n > 0 then 'fof' else 'popular' end as reason,
    greatest(s.co_n, s.taste_n, s.fof_n)::int as shared,
    s.score
  from scored s join public.profiles p on p.id = s.uid
  where s.score > 0 and p.id <> (select uid from me)
    and not exists (select 1 from public.follows f where f.follower_id = (select uid from me) and f.following_id = p.id)
    and not public.blocked_between((select uid from me), p.id)
  order by s.score desc limit lim;
$$;
revoke all on function public.suggested_people(integer) from public, anon;
grant execute on function public.suggested_people(integer) to authenticated;

-- popular_people suggérait un compte bloqué ou bloquant (l'abonnement échoue ensuite).
create or replace function public.popular_people(lim integer default 12)
returns table(id uuid, username text, display_name text, avatar_url text, bio text, reason text, shared integer, score numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid)
  select p.id, p.username, p.display_name, p.avatar_url, p.bio, 'popular'::text,
    count(f.follower_id)::int as shared, count(f.follower_id)::numeric as score
  from public.profiles p
  left join public.follows f on f.following_id = p.id
  where p.id <> (select uid from me)
    and not exists (select 1 from public.follows ff where ff.follower_id = (select uid from me) and ff.following_id = p.id)
    and not public.blocked_between((select uid from me), p.id)
  group by p.id order by score desc limit lim;
$$;
revoke all on function public.popular_people(integer) from public, anon;
grant execute on function public.popular_people(integer) to authenticated;

-- Portail partenaire : réservé au gestionnaire du lieu, mêmes règles de visibilité.
create or replace function public.partner_place_stats(p_place uuid)
returns table(active_now bigint, checkins_30d bigint, uniques_30d bigint, peak_hour integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with v as (
    select ci.user_id, ci.created_at, ci.expires_at
    from public.check_ins ci
    where ci.place_id = p_place
      and (ci.expires_at > now() or ci.created_at > now() - interval '60 days')
      and private.sees_check_in(auth.uid(), ci.user_id, ci.hidden)
  )
  select
    (select count(*) from v where expires_at > now()),
    (select count(*) from v where created_at > now() - interval '30 days'),
    (select count(distinct user_id) from v where created_at > now() - interval '30 days'),
    -- Seuil d'anonymat : l'heure de pointe ne trahit pas l'habitude d'une ou deux personnes.
    case when (select count(distinct user_id) from v where created_at > now() - interval '60 days') >= 3 then
      (select extract(hour from created_at at time zone 'America/Montreal')::int
         from v where created_at > now() - interval '60 days'
         group by 1 order by count(*) desc limit 1)
    end
  where exists (
    select 1 from public.place_partners pp
    where pp.place_id = p_place and pp.user_id = auth.uid()
  );
$$;
revoke all on function public.partner_place_stats(uuid) from public, anon;
grant execute on function public.partner_place_stats(uuid) to authenticated;

-- Widget public (sans connexion, exprès) : comptes cachés exclus, personnes distinctes, seuil de 3.
create or replace function public.place_widget(pid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with v as (
    select ci.user_id, ci.created_at, ci.expires_at
    from public.check_ins ci
    where ci.place_id = pid
      and (ci.expires_at > now()
           or ci.created_at > date_trunc('day', now() at time zone 'America/Montreal') at time zone 'America/Montreal')
      and private.sees_check_in(null, ci.user_id, ci.hidden)
  ),
  act as (select count(distinct user_id) as n from v where expires_at > now()),
  tod as (
    select count(*) as n, count(distinct user_id) as u from v
    where created_at > date_trunc('day', now() at time zone 'America/Montreal') at time zone 'America/Montreal'
  )
  select jsonb_build_object(
    'name', p.name,
    'category', p.category,
    -- Seuil d'anonymat : sous 3 personnes, pas de chiffre (null), pour ne suivre personne de lieu en lieu.
    'active', (select case when act.n >= 3 then act.n::int end from act),
    'today', (select case when tod.u >= 3 then tod.n::int end from tod),
    'next_event', (select jsonb_build_object('title', e.title, 'starts_at', e.starts_at)
                   from public.partner_events e where e.place_id = p.id and e.starts_at > now()
                   order by e.starts_at limit 1)
  )
  from public.places p where p.id = pid;
$$;
revoke all on function public.place_widget(uuid) from public;
grant execute on function public.place_widget(uuid) to anon, authenticated;

create or replace function public.city_pulse()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with buckets as (
    select date_trunc('hour', now()) - (i || ' hours')::interval as h
    from generate_series(11, 0, -1) as i
  ),
  counts as (
    select b.h, count(ci.id)::int as n
    from buckets b
    left join public.check_ins ci
      on ci.created_at >= b.h and ci.created_at < b.h + interval '1 hour'
     and private.sees_check_in(null, ci.user_id, ci.hidden)
    group by b.h
  ),
  cur as (
    select count(*)::numeric n from public.check_ins ci
    where ci.created_at > now() - interval '2 hours'
      and private.sees_check_in(null, ci.user_id, ci.hidden)
  ),
  hist as (
    -- même fenêtre de 2h, moyenne des 7 derniers jours
    select greatest(avg(day_n), 0.5) as avg_n from (
      select count(ci.id) as day_n
      from generate_series(1, 7) d
      left join public.check_ins ci
        on ci.created_at > now() - (d || ' days')::interval - interval '2 hours'
       and ci.created_at <= now() - (d || ' days')::interval
       and private.sees_check_in(null, ci.user_id, ci.hidden)
      group by d
    ) s
  ),
  topcat as (
    select pl.category, count(*)::int n
    from public.check_ins ci join public.places pl on pl.id = ci.place_id
    where ci.expires_at > now()
      and private.sees_check_in(null, ci.user_id, ci.hidden)
    group by pl.category order by n desc limit 1
  )
  select jsonb_build_object(
    'series', (select jsonb_agg(jsonb_build_object('h', to_char(h at time zone 'America/Montreal', 'HH24h'), 'n', n) order by h) from counts),
    'live_now', (select count(*)::int from public.check_ins ci
                 where ci.expires_at > now() and private.sees_check_in(null, ci.user_id, ci.hidden)),
    'magnitude', (select least(round((cur.n / hist.avg_n)::numeric, 1), 9.9) from cur, hist),
    'top_category', (select category from topcat),
    'top_category_n', coalesce((select n from topcat), 0)
  );
$$;
revoke all on function public.city_pulse() from public, anon;
grant execute on function public.city_pulse() to authenticated;

create or replace function public.place_forecast(p_place uuid)
returns table(peak_hour integer, confidence integer, samples bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with v as (
    select ci.user_id, extract(hour from ci.created_at at time zone 'America/Montreal')::int as h
    from public.check_ins ci
    where ci.place_id = p_place and ci.created_at > now() - interval '60 days'
      and private.sees_check_in(auth.uid(), ci.user_id, ci.hidden)
  ),
  hist as (select h, count(*) as n from v group by 1),
  total as (select coalesce(sum(n),0) as t from hist)
  select h as peak_hour,
         least(95, 35 + (select t from total)::int * 5)::int as confidence,
         (select t from total) as samples
  from hist
  -- Seuil d'anonymat : jamais l'heure d'habitude d'une ou deux personnes.
  where (select count(distinct user_id) from v) >= 3
  order by n desc, h desc
  limit 1;
$$;
revoke all on function public.place_forecast(uuid) from public, anon;
grant execute on function public.place_forecast(uuid) to authenticated;

-- recommended_places n'a aucun appelant d'interface (fetchRecommendedPlaces est du code mort) :
-- on la ferme plutôt que de la réécrire.
revoke all on function public.recommended_places(double precision, double precision, integer) from public, anon, authenticated;

-- Gardien : le dernier lieu PENDANT la session de garde, pas l'historique d'avant ; rien si blocage.
create or replace function public.my_proteges()
returns table(user_id uuid, username text, display_name text, avatar_url text, active_until timestamp with time zone, last_place text, last_seen timestamp with time zone)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.username, p.display_name, p.avatar_url, gl.active_until,
    (select pl.name from public.check_ins ci join public.places pl on pl.id = ci.place_id
      where ci.user_id = p.id and ci.expires_at > gl.created_at
      order by ci.created_at desc limit 1),
    (select max(ci.created_at) from public.check_ins ci
      where ci.user_id = p.id and ci.expires_at > gl.created_at)
  from public.guardian_links gl join public.profiles p on p.id = gl.user_id
  where gl.guardian_id = auth.uid() and gl.active_until > now()
    and not public.blocked_between(gl.user_id, gl.guardian_id);
$$;
revoke all on function public.my_proteges() from public, anon;
grant execute on function public.my_proteges() to authenticated;

-- Proximité : la position est ramenée sur une grille AVANT d'être stockée (au mieux la case, jamais le mètre).
create or replace function private.snap_live_position()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- ponytail: grille fixe calée sur Montréal (0,0005° de lat ≈ 56 m ; 0,0007° de lng ≈ 55 m à 45,5° N).
  -- Hors du Québec les cases s'étirent en longitude : passer à un pas qui dépend de la latitude si l'app en sort.
  new.lat := round(new.lat::numeric / 0.0005) * 0.0005;
  new.lng := round(new.lng::numeric / 0.0007) * 0.0007;
  return new;
end;
$$;
revoke all on function private.snap_live_position() from public, anon, authenticated;

drop trigger if exists trg_snap_live_position on public.live_positions;
create trigger trg_snap_live_position
  before insert or update on public.live_positions
  for each row execute function private.snap_live_position();

-- friends_nearby ne lit que les positions de moins de 3 minutes : les anciennes (au mètre près) partent.
delete from public.live_positions where updated_at < now() - interval '3 minutes';

-- Tâche horaire purge-moves : purge aussi les positions de proximité de plus d'une heure (minimisation).
create or replace function public.purge_moves()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.moves where expires_at < now();
  delete from public.live_positions where updated_at < now() - interval '1 hour';
$$;
revoke all on function public.purge_moves() from public, anon, authenticated;

-- =====================================================================================
-- 4. Rencontres et événements
-- =====================================================================================

-- dating_like ne dit plus si la cible est mineure : toute cible impossible reçoit « indisponible »,
-- rien n'est écrit vers un compte non inscrit, l'appelant doit être inscrit.
create or replace function public.dating_like(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); matched boolean; a uuid; b uuid; cid uuid;
begin
  if me is null then raise exception 'auth requise'; end if;
  if not public.is_adult(me) then raise exception 'rencontres réservées aux 18+'; end if;
  if not exists (select 1 from public.dating_profiles where user_id = me and enabled) then
    raise exception 'rencontres non activées';
  end if;
  if target is null or target = me
     or not exists (select 1 from public.dating_profiles where user_id = target and enabled)
     or not public.is_adult(target)
     or public.blocked_between(me, target) then
    raise exception 'indisponible';
  end if;
  insert into public.dating_likes (from_user, to_user) values (me, target) on conflict do nothing;
  matched := exists (select 1 from public.dating_likes where from_user = target and to_user = me);
  if matched then
    if me < target then a := me; b := target; else a := target; b := me; end if;
    insert into public.conversations (user_a, user_b, status, requested_by)
      values (a, b, 'accepted', me)
      on conflict (user_a, user_b) do update set status = 'accepted'
      returning id into cid;
    insert into public.conversation_members (conversation_id, user_id)
      values (cid, a), (cid, b) on conflict do nothing;
  end if;
  return jsonb_build_object('matched', matched, 'conversation_id', cid);
end;
$$;
revoke all on function public.dating_like(uuid) from public, anon;
grant execute on function public.dating_like(uuid) to authenticated;

-- Compteur « y vont » : un total agrégé, aucun identifiant de personne (la lecture nominative se ferme en D).
create or replace function public.event_rsvp_counts(event_ids uuid[])
returns table(event_id uuid, going bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.event_id, sum(r.party_size)::bigint
  from public.event_rsvps r
  where r.event_id = any(event_ids)
  group by r.event_id;
$$;
revoke all on function public.event_rsvp_counts(uuid[]) from public, anon;
grant execute on function public.event_rsvp_counts(uuid[]) to authenticated;

-- =====================================================================================
-- 5. Conversations, groupes, balises, invitations, mode éphémère
-- =====================================================================================

-- Groupes : on n'ajoute directement que des amis MUTUELS (les autres sont écartés sans bruit) ; titre borné à 60.
create or replace function public.create_group_conversation(group_title text, members uuid[])
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); cid uuid; m uuid;
begin
  if me is null then raise exception 'auth requise'; end if;
  if coalesce(array_length(members, 1), 0) > 50 then raise exception 'trop de membres'; end if;
  insert into public.conversations (is_group, title, created_by, status)
    values (true, left(nullif(trim(coalesce(group_title, '')), ''), 60), me, 'accepted')
    returning id into cid;
  insert into public.conversation_members (conversation_id, user_id) values (cid, me) on conflict do nothing;
  foreach m in array coalesce(members, '{}'::uuid[]) loop
    if m <> me
       and public.is_mutual_friend(me, m)
       and not public.blocked_between(me, m) then
      insert into public.conversation_members (conversation_id, user_id) values (cid, m) on conflict do nothing;
    end if;
  end loop;
  return cid;
end;
$$;
revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;

-- Chacun peut quitter un groupe (un DM se règle par le blocage).
create or replace function public.leave_group(conv uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth requise'; end if;
  delete from public.conversation_members cm
   using public.conversations c
   where c.id = conv and c.is_group
     and cm.conversation_id = conv and cm.user_id = me;
  if not found then raise exception 'groupe introuvable'; end if;
  -- ses liens d'invitation ne font plus entrer personne
  delete from public.squad_invites where conversation_id = conv and inviter_id = me;
  -- le dernier parti emporte le groupe
  delete from public.conversations c
   where c.id = conv
     and not exists (select 1 from public.conversation_members cm where cm.conversation_id = conv);
end;
$$;
revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;

-- Balise : défense en profondeur. La conversation d'une balise est toujours un groupe créé par son auteur
-- (le RETOUR ARRIÈRE du lot 1 B rouvrirait l'écriture de beacons.conversation_id).
create or replace function public.respond_beacon(b_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); b record; n int; cid uuid; owner_name text;
begin
  if me is null then raise exception 'auth requise'; end if;
  select * into b from public.beacons where id = b_id and expires_at > now();
  if b is null then raise exception 'balise éteinte'; end if;
  if b.user_id = me then raise exception 'c''est ta balise'; end if;
  if not public.is_mutual_friend(me, b.user_id) then raise exception 'réservé aux amis'; end if;
  if public.blocked_between(me, b.user_id) then raise exception 'indisponible'; end if;
  if b.conversation_id is not null and not exists (
       select 1 from public.conversations c
        where c.id = b.conversation_id and c.is_group and c.created_by = b.user_id) then
    raise exception 'balise invalide';
  end if;

  insert into public.beacon_responses (beacon_id, user_id) values (b_id, me) on conflict do nothing;
  select count(*) into n from public.beacon_responses where beacon_id = b_id;

  if b.conversation_id is not null then
    cid := b.conversation_id;
    insert into public.conversation_members (conversation_id, user_id) values (cid, me) on conflict do nothing;
  elsif n >= 2 then
    select coalesce(display_name, username) into owner_name from public.profiles where id = b.user_id;
    -- titre borné à 60 caractères, comme create_group_conversation
    insert into public.conversations (is_group, title, created_by, status)
      values (true, left('Sortie de ' || owner_name, 58) || ' 🔦', b.user_id, 'accepted')
      returning id into cid;
    insert into public.conversation_members (conversation_id, user_id)
      select cid, b.user_id union select cid, user_id from public.beacon_responses where beacon_id = b_id
      on conflict do nothing;
    update public.beacons set conversation_id = cid where id = b_id;
  end if;

  return jsonb_build_object('responses', n, 'conversation_id', cid);
end;
$$;
revoke all on function public.respond_beacon(uuid) from public, anon;
grant execute on function public.respond_beacon(uuid) to authenticated;

-- Invitations : jamais sur un DM, code toujours tiré au sort (le client n'écrit que conversation_id, inviter_id).
revoke insert, update on public.squad_invites from authenticated;
grant insert (conversation_id, inviter_id) on public.squad_invites to authenticated;

alter policy squad_invites_insert_member on public.squad_invites
  to authenticated
  with check (
    inviter_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and exists (select 1 from public.conversations c
                 where c.id = squad_invites.conversation_id and c.is_group)
  );

-- Le suivi mutuel avec l'inviteur est gardé : la page /join l'annonce et demande une confirmation.
create or replace function public.join_squad(invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); inv record; gname text;
begin
  if me is null then raise exception 'auth requise'; end if;
  select * into inv from public.squad_invites s
   where s.code = invite_code
     and exists (select 1 from public.conversations c where c.id = s.conversation_id and c.is_group);
  if inv is null then raise exception 'invitation invalide'; end if;
  if public.blocked_between(me, inv.inviter_id) then raise exception 'invitation indisponible'; end if;
  insert into public.conversation_members (conversation_id, user_id)
    values (inv.conversation_id, me) on conflict do nothing;
  if me <> inv.inviter_id then
    insert into public.follows (follower_id, following_id) values (me, inv.inviter_id) on conflict do nothing;
    insert into public.follows (follower_id, following_id) values (inv.inviter_id, me) on conflict do nothing;
  end if;
  update public.squad_invites set uses = uses + 1 where code = invite_code;
  select coalesce(c.title, 'Groupe') into gname from public.conversations c where c.id = inv.conversation_id;
  return jsonb_build_object('conversation_id', inv.conversation_id, 'title', gname);
end;
$$;
revoke all on function public.join_squad(text) from public, anon;
grant execute on function public.join_squad(text) to authenticated;

-- Aperçu pour la page /join : qui invite, quel groupe, combien de membres. Rien n'est écrit.
create or replace function public.squad_invite_preview(invite_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'title', coalesce(c.title, 'Groupe'),
    'members', (select count(*) from public.conversation_members cm where cm.conversation_id = c.id),
    'inviter', jsonb_build_object('username', p.username, 'display_name', p.display_name,
                                  'avatar_url', p.avatar_url))
  from public.squad_invites s
  join public.conversations c on c.id = s.conversation_id and c.is_group
  join public.profiles p on p.id = s.inviter_id
  where s.code = invite_code
    and auth.uid() is not null
    and not public.blocked_between(auth.uid(), s.inviter_id);
$$;
revoke all on function public.squad_invite_preview(text) from public, anon;
grant execute on function public.squad_invite_preview(text) to authenticated;

-- Mode éphémère : il ne vaut que pour les messages écrits APRÈS son activation, et ne s'arme pas
-- sur une demande de DM non acceptée. Sémantique de groupe inchangée.
alter table public.conversations add column if not exists ephemeral_since timestamptz;
update public.conversations set ephemeral_since = now()
 where ephemeral_mode <> 'off' and ephemeral_since is null;

create or replace function public.set_ephemeral_mode(conv uuid, mode text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_conversation_participant(conv) then raise exception 'non autorisé'; end if;
  if mode not in ('off', 'read', '24h') then raise exception 'mode invalide'; end if;
  if mode <> 'off' and exists (select 1 from public.conversations
                               where id = conv and status <> 'accepted') then
    raise exception 'demande non acceptée';
  end if;
  update public.conversations
     set ephemeral_since = case
           when mode = 'off' then null
           when ephemeral_mode = mode then ephemeral_since  -- même mode re-choisi : on garde l'heure
           else now()
         end,
         ephemeral_mode = mode
   where id = conv;
end;
$$;
revoke all on function public.set_ephemeral_mode(uuid, text) from public, anon;
grant execute on function public.set_ephemeral_mode(uuid, text) to authenticated;

create or replace function public.mark_conversation_read(conv uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare m text; v_since timestamptz;
begin
  if not public.is_conversation_participant(conv) then return; end if;
  select ephemeral_mode, ephemeral_since into m, v_since from public.conversations where id = conv;
  update public.messages set read_at = now()
    where conversation_id = conv and sender_id <> auth.uid() and read_at is null;
  if m = 'read' and v_since is not null then
    update public.messages set expires_at = now() + interval '10 seconds'
      where conversation_id = conv and sender_id <> auth.uid() and expires_at is null
        and created_at >= v_since;
  end if;
end;
$$;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Messages : le client n'écrit plus que le contenu ; id, created_at, read_at, opened_at, expires_at
-- et kind sont posés par la base (valeurs par défaut, déclencheurs, fonctions definer).
revoke insert on public.messages from authenticated;
grant insert (conversation_id, sender_id, body, image_url, poll_id, view_once) on public.messages to authenticated;

-- Sondages : l'option doit appartenir au sondage, et on ne vote que dans une conversation dont on est membre.
alter policy poll_votes_upsert_own on public.poll_votes
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.polls p
                where p.id = poll_votes.poll_id and public.is_conversation_participant(p.conversation_id))
    and exists (select 1 from public.poll_options o
                where o.id = poll_votes.option_id and o.poll_id = poll_votes.poll_id)
  );
alter policy poll_votes_update_own on public.poll_votes
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.polls p
                where p.id = poll_votes.poll_id and public.is_conversation_participant(p.conversation_id))
    and exists (select 1 from public.poll_options o
                where o.id = poll_votes.option_id and o.poll_id = poll_votes.poll_id)
  );

-- =====================================================================================
-- 6. Images : adresses contraintes, bucket privé « chat », vue unique
-- =====================================================================================

-- Adresse d'image d'un message : chemin du bucket privé « chat » (<conversation>/<expéditeur>/<fichier>)
-- ou, pendant la transition (code web de main), fichier du bucket media dans le dossier de l'expéditeur.
-- La partie D retire la seconde forme. Pure : exécutable par authenticated (contrainte CHECK).
create or replace function private.message_image_ok(u text, conv uuid, sender uuid)
returns boolean
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select u is null
      or u ~ ('^' || conv::text || '/' || sender::text || '/[A-Za-z0-9._-]+$')
      or u ~ ('^https://aovuweoehzflydjtxpdr\.supabase\.co/storage/v1/object/public/media/'
              || sender::text || '/[A-Za-z0-9._-]+$');
$$;
revoke all on function private.message_image_ok(text, uuid, uuid) from public, anon;
grant execute on function private.message_image_ok(text, uuid, uuid) to authenticated, service_role;

-- posts / stories : NOT VALID, les médias de démo (picsum, MDN) restent ; à remplacer avant le lancement, puis VALIDATE.
alter table public.posts drop constraint if exists posts_photo_url_source;
alter table public.posts add constraint posts_photo_url_source check (
  photo_url is null
  or photo_url ~ ('^https://aovuweoehzflydjtxpdr\.supabase\.co/storage/v1/object/public/media/'
                  || user_id::text || '/[A-Za-z0-9._-]+$')
) not valid;

alter table public.stories drop constraint if exists stories_media_url_source;
alter table public.stories add constraint stories_media_url_source check (
  media_url ~ ('^https://aovuweoehzflydjtxpdr\.supabase\.co/storage/v1/object/public/media/'
               || user_id::text || '/[A-Za-z0-9._-]+$')
) not valid;

-- messages et profiles : aucune ligne hors motif, contraintes validées.
alter table public.messages drop constraint if exists messages_image_url_source;
alter table public.messages add constraint messages_image_url_source
  check (private.message_image_ok(image_url, conversation_id, sender_id));

alter table public.profiles drop constraint if exists profiles_avatar_url_source;
alter table public.profiles add constraint profiles_avatar_url_source check (
  avatar_url is null
  or avatar_url ~ ('^https://aovuweoehzflydjtxpdr\.supabase\.co/storage/v1/object/public/media/'
                   || id::text || '/[A-Za-z0-9._-]+$')
  or avatar_url ~ '^https://api\.dicebear\.com/'
);

-- Vue unique : l'adresse d'un snap ne vit plus dans public.messages (lisible par tout membre, par la table
-- comme par Realtime) mais dans private.snaps, hors API. Seuls l'auteur (fetch_messages) et le premier
-- qui l'ouvre (open_snap) la reçoivent.
create table if not exists private.snaps (
  message_id uuid primary key
    references public.messages(id) on delete cascade deferrable initially deferred,
  image_url text not null,
  opened_by uuid  -- posé par open_snap : seul ce compte (et l'auteur) peut signer ou effacer le fichier
);
create index if not exists snaps_image_url_idx on private.snaps (image_url);
alter table private.snaps enable row level security;
revoke all on table private.snaps from public, anon, authenticated;

-- un snap n'a plus d'image_url dans messages : il compte quand même comme contenu
alter table public.messages drop constraint if exists messages_has_content;
alter table public.messages add constraint messages_has_content
  check (body is not null or image_url is not null or poll_id is not null or view_once);

create or replace function private.stash_snap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.view_once then
    if new.image_url is null then raise exception 'snap sans photo'; end if;
    -- même règle d'adresse que messages_image_url_source (le CHECK ne voit plus l'adresse du snap)
    if not private.message_image_ok(new.image_url, new.conversation_id, new.sender_id) then
      raise exception 'adresse de photo refusée' using errcode = 'check_violation';
    end if;
    insert into private.snaps (message_id, image_url) values (new.id, new.image_url);
    new.image_url := null;
  end if;
  return new;
end;
$$;
revoke all on function private.stash_snap() from public, anon, authenticated;

drop trigger if exists trg_stash_snap on public.messages;
create trigger trg_stash_snap before insert on public.messages
  for each row execute function private.stash_snap();

-- snaps déjà en base (0 au relevé du 2026-11-11)
insert into private.snaps (message_id, image_url)
  select id, image_url from public.messages where view_once and image_url is not null
  on conflict (message_id) do nothing;
update public.messages set image_url = null where view_once and image_url is not null;

create or replace function public.fetch_messages(conv uuid)
returns table(id uuid, conversation_id uuid, sender_id uuid, body text, image_url text, poll_id uuid,
              created_at timestamptz, read_at timestamptz, expires_at timestamptz,
              view_once boolean, opened_at timestamptz, kind text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, m.conversation_id, m.sender_id, m.body,
    case
      when not m.view_once then m.image_url
      when m.sender_id = auth.uid() then s.image_url  -- l'auteur ; le destinataire passe par open_snap
    end as image_url,
    m.poll_id, m.created_at, m.read_at, m.expires_at, m.view_once, m.opened_at, m.kind
  from public.messages m
  left join private.snaps s on s.message_id = m.id
  where m.conversation_id = conv
    and public.is_conversation_participant(conv)
    and (m.expires_at is null or m.expires_at > now())
  order by m.created_at asc;
$$;
revoke all on function public.fetch_messages(uuid) from public, anon;
grant execute on function public.fetch_messages(uuid) to authenticated;

create or replace function public.open_snap(msg uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare m public.messages%rowtype;
begin
  select * into m from public.messages where id = msg;
  if m.id is null then raise exception 'introuvable'; end if;
  if not public.is_conversation_participant(m.conversation_id) then raise exception 'non autorisé'; end if;
  if m.sender_id = auth.uid() then raise exception 'c''est ton propre snap'; end if;
  if not m.view_once then raise exception 'pas un snap'; end if;
  -- une seule ouverture, même pour deux appels simultanés
  update public.messages
     set opened_at = now(), expires_at = now() + interval '8 seconds'
   where id = msg and opened_at is null;
  if not found then
    return jsonb_build_object('image_url', null, 'already', true);
  end if;
  update private.snaps set opened_by = auth.uid() where message_id = msg;
  return jsonb_build_object(
    'image_url', (select s.image_url from private.snaps s where s.message_id = msg),
    'already', false);
end;
$$;
revoke all on function public.open_snap(uuid) from public, anon;
grant execute on function public.open_snap(uuid) to authenticated;

-- Bucket media (posts, stories ; vidéo gardée) : dépôt dans son seul dossier <uid>/, 50 Mo, image et vidéo.
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
                                  'video/mp4','video/quicktime','video/webm']
 where id = 'media';

drop policy if exists media_auth_insert on storage.objects;
create policy media_auth_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Aucun appelant ne fait update()/move()/copy() (upload upsert:false) : la policy UPDATE disparaît,
-- move/update restent impossibles même avec la lecture de ses propres fichiers ci-dessous.
drop policy if exists media_auth_update on storage.objects;

drop policy if exists media_auth_delete on storage.objects;
create policy media_auth_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and owner_id = (select auth.uid())::text);

-- list() et remove() exigent aussi SELECT : le propriétaire liste et efface ses fichiers (effacement du compte).
drop policy if exists media_owner_select on storage.objects;
create policy media_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and owner_id = (select auth.uid())::text);

-- Bucket PRIVÉ « chat » pour les photos de messages (adresses signées).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create index if not exists messages_image_url_idx on public.messages (image_url) where image_url is not null;

-- Lecture (signature) ou effacement d'un fichier « chat » : le message qui le référence (photo ordinaire ou
-- snap rangé dans private.snaps) doit venir de celui qui l'a déposé (2e segment du chemin) ; l'appelant est
-- membre ; message non expiré. Snap : lisible par l'auteur, ou par celui qui l'a ouvert (open_snap) pendant
-- ses 8 s ; effaçable par ce dernier seulement (il l'efface à l'affichage). Les autres membres, même dans
-- un groupe, ne peuvent ni le lister ni le signer.
create or replace function private.chat_object_ok(obj text, for_delete boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with m as (
    select mm.conversation_id, mm.sender_id, mm.expires_at, mm.view_once, null::uuid as opened_by
    from public.messages mm where mm.image_url = obj
    union all
    select mm.conversation_id, mm.sender_id, mm.expires_at, mm.view_once, s.opened_by
    from private.snaps s join public.messages mm on mm.id = s.message_id where s.image_url = obj
  )
  select exists (
    select 1 from m
    where split_part(obj, '/', 1) = m.conversation_id::text
      and split_part(obj, '/', 2) = m.sender_id::text
      and public.is_conversation_participant(m.conversation_id)
      and (m.expires_at is null or m.expires_at > now())
      and case when for_delete
               then m.view_once and m.opened_by = auth.uid()
               else (not m.view_once or m.sender_id = auth.uid() or m.opened_by = auth.uid())
          end
  );
$$;
revoke all on function private.chat_object_ok(text, boolean) from public, anon;
grant execute on function private.chat_object_ok(text, boolean) to authenticated;

-- Dépôt : seulement dans <une conversation dont je suis membre>/<moi>/, et pas dans un DM bloqué.
drop policy if exists chat_insert_member on storage.objects;
create policy chat_insert_member on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and case
          when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
               and not public.dm_blocked(((storage.foldername(name))[1])::uuid)
          else false
        end
  );

drop policy if exists chat_select_member on storage.objects;
create policy chat_select_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat'
    and (owner_id = (select auth.uid())::text or private.chat_object_ok(name, false))
  );

drop policy if exists chat_delete on storage.objects;
create policy chat_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat'
    and (owner_id = (select auth.uid())::text or private.chat_object_ok(name, true))
  );

-- =====================================================================================
-- 7. Realtime : appels sur canaux PRIVÉS, suppressions non diffusées
-- =====================================================================================

-- Droit d'appeler : membre d'une conversation 1-1 acceptée, sans blocage.
create or replace function private.can_call(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_members m
      on m.conversation_id = c.id and m.user_id = auth.uid()
    where c.id = conv
      and c.is_group is not true
      and c.status = 'accepted'
      and auth.uid() in (c.user_a, c.user_b)
      and not public.blocked_between(c.user_a, c.user_b)
  );
$$;
revoke all on function private.can_call(uuid) from public, anon, authenticated;

-- Sujet de signalisation « call:<conversation>:<nonce> » : réservé aux ayants droit de cette conversation.
create or replace function private.can_use_call_topic(t text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if t is null or t !~* '^call:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.can_call(split_part(t, ':', 2)::uuid);
end;
$$;
revoke all on function private.can_use_call_topic(text) from public, anon;
grant execute on function private.can_use_call_topic(text) to authenticated;

-- La sonnerie est émise PAR LA BASE : l'identité de l'appelant est lue dans profiles, jamais fournie par le client.
create or replace function public.ring_call(conv uuid, call_id uuid, call_kind text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  callee uuid;
  caller jsonb;
begin
  if me is null then raise exception 'auth requise'; end if;
  if call_id is null or call_kind is null or call_kind not in ('audio', 'video') then
    raise exception 'appel invalide';
  end if;
  if not private.can_call(conv) then raise exception 'appel indisponible'; end if;

  select case when c.user_a = me then c.user_b else c.user_a end
    into callee
  from public.conversations c
  where c.id = conv;

  select jsonb_build_object('id', p.id, 'username', p.username,
                            'display_name', p.display_name, 'avatar_url', p.avatar_url)
    into caller
  from public.profiles p
  where p.id = me;

  -- realtime.send est INVOKER : l'INSERT se fait en tant que postgres (bypassrls) ; aucune policy INSERT
  -- n'ouvre ring:* aux clients.
  perform realtime.send(
    jsonb_build_object('callId', call_id, 'kind', call_kind, 'conversationId', conv, 'from', caller),
    'ring',
    'ring:' || callee::text,
    true
  );
end;
$$;
revoke all on function public.ring_call(uuid, uuid, text) from public, anon;
grant execute on function public.ring_call(uuid, uuid, text) to authenticated;

-- Policies Realtime : elles ne valent que pour les canaux PRIVÉS (les canaux publics actuels ne les lisent pas).
drop policy if exists "appels_sonnerie_lecture" on realtime.messages;
create policy "appels_sonnerie_lecture" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'ring:' || (select auth.uid())::text
  );

drop policy if exists "appels_signalisation_lecture" on realtime.messages;
create policy "appels_signalisation_lecture" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select private.can_use_call_topic((select realtime.topic())))
  );

drop policy if exists "appels_signalisation_ecriture" on realtime.messages;
create policy "appels_signalisation_ecriture" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and (select private.can_use_call_topic((select realtime.topic())))
  );

-- Canaux postgres_changes de l'app rejoints en PRIVÉ (web à venir, build mobile 10) : lecture seule,
-- aucune policy INSERT (personne ne diffuse sur ces sujets). Les événements restent filtrés par le RLS des tables.
drop policy if exists "canaux_donnees_lecture" on realtime.messages;
create policy "canaux_donnees_lecture" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) ~* '^(inbox|notif-badge|map-checkins|feed-live|beacons-live|brain-live|(thread|poll)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
  );

-- Le RLS ne filtre pas les suppressions : elles ne sont plus diffusées (fuite des clés primaires).
alter publication supabase_realtime set (publish = 'insert, update');

-- Tables publiées qu'aucun écran n'écoute (web et mobile relus) : retirées.
do $$
declare t text;
begin
  foreach t in array array['comments', 'conversation_members', 'conversations', 'likes', 'stories'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================================
-- 8. Inscription, gardien, push, plafonds
-- =====================================================================================

-- Âge minimum de Whozin : SEUL endroit où le seuil est écrit (16 ans, jour civil de Montréal).
-- Passer à 18 : changer '16 years' ici.
create or replace function private.age_ok(d date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d is not null
     and d > date '1900-01-01'
     and d <= ((now() at time zone 'America/Montreal')::date - interval '16 years')::date;
$$;
revoke all on function private.age_ok(date) from public, anon, authenticated;

create or replace function public.set_birthdate(d date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'auth requise'; end if;
  if not private.age_ok(d) then raise exception 'date de naissance invalide'; end if;
  update public.profiles set birthdate = d where id = auth.uid() and birthdate is null;
  if not found then raise exception 'date de naissance déjà enregistrée'; end if;
end;
$$;
revoke all on function public.set_birthdate(date) from public, anon;
grant execute on function public.set_birthdate(date) to authenticated;

-- Inscription : date fournie et trop jeune = refus ; la fiche naît à la CONFIRMATION du courriel ;
-- avatar_url n'est plus repris des métadonnées ; noms bornés ; « whozin » réservé à l'app.
-- Phase 2 (refus sans date) : après le build mobile 10, voir plan.md.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uname text; dname text; bd date;
begin
  begin
    bd := (new.raw_user_meta_data->>'birthdate')::date;
  exception when others then bd := null;
  end;
  if bd is not null and not private.age_ok(bd) then
    raise exception 'Whozin : 16 ans et plus' using errcode = 'check_violation';
  end if;

  if new.email_confirmed_at is null then
    return new;  -- la fiche naîtra par on_auth_user_confirmed
  end if;

  uname := nullif(trim(new.raw_user_meta_data->>'username'), '');
  if uname is null or char_length(uname) < 2 or position('whozin' in lower(uname)) > 0 then
    uname := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  uname := left(uname, 30);
  if exists (select 1 from public.profiles where username = uname) then
    uname := left(uname, 25) || '_' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  dname := left(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 50);
  if position('whozin' in lower(coalesce(dname, ''))) > 0 then dname := null; end if;

  insert into public.profiles (id, username, display_name, birthdate)
  values (new.id, uname, dname, bd)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- on_auth_user_created (AFTER INSERT) reste : contrôle d'âge, et fiche si le compte naît déjà confirmé.
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_new_user();

-- Aucun code n'insère dans profiles : une fiche posée par le client échapperait à la règle d'âge.
drop policy if exists profiles_insert_own on public.profiles;
revoke insert on public.profiles from authenticated;

-- Gardien : un ami mutuel seulement (l'écran ne propose déjà que les mutuels).
create or replace function public.guardian_start(guardian_username text, hours integer default 8)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); g public.profiles%rowtype;
begin
  if me is null then raise exception 'auth requise'; end if;
  if hours < 1 or hours > 24 then raise exception 'durée invalide'; end if;
  select * into g from public.profiles where username = lower(trim(guardian_username));
  if g.id is null then raise exception 'introuvable'; end if;
  if g.id = me then raise exception 'choisis quelqu''un d''autre'; end if;
  if public.blocked_between(me, g.id) then raise exception 'indisponible'; end if;
  if not public.is_mutual_friend(me, g.id) then raise exception 'réservé aux amis'; end if;
  insert into public.guardian_links (user_id, guardian_id, active_until)
  values (me, g.id, now() + (hours || ' hours')::interval)
  on conflict (user_id) do update set guardian_id = excluded.guardian_id,
    active_until = excluded.active_until, created_at = now();
  return jsonb_build_object('guardian_id', g.id, 'username', g.username,
    'display_name', g.display_name, 'avatar_url', g.avatar_url,
    'active_until', now() + (hours || ' hours')::interval);
end;
$$;
revoke all on function public.guardian_start(text, integer) from public, anon;
grant execute on function public.guardian_start(text, integer) to authenticated;

-- Push : le lien « gardien » ne vaut que dans le sens protégé -> gardien, pendant la veille
-- (+ 15 min de grâce pour « bien rentré », guardian_home met active_until = now()). Le reste est inchangé.
create or replace function private.can_push(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and target <> auth.uid()
    and not public.blocked_between(auth.uid(), target)
    and (
      exists (
        select 1
        from public.conversation_members a
        join public.conversation_members b on b.conversation_id = a.conversation_id
        join public.conversations c on c.id = a.conversation_id
        where a.user_id = auth.uid() and b.user_id = target and c.status = 'accepted'
      )
      or public.is_mutual_friend(auth.uid(), target)
      or exists (
        select 1 from public.guardian_links g
        where g.user_id = auth.uid() and g.guardian_id = target
          and g.active_until > now() - interval '15 minutes'
      )
      or exists (
        select 1
        from public.reservations r
        join public.place_partners pp on pp.place_id = r.place_id
        where (r.user_id = auth.uid() and pp.user_id = target)
           or (r.user_id = target and pp.user_id = auth.uid())
      )
    );
$$;
revoke all on function private.can_push(uuid) from public, anon;
grant execute on function private.can_push(uuid) to authenticated;

-- Plafonds par compte et par heure, appelés par les routes /api avec le jeton de l'utilisateur.
-- Compteurs hors API (schéma private) : une ligne par compte × genre × heure.
create table if not exists private.api_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  bucket timestamptz not null,
  n integer not null default 0,
  primary key (user_id, kind, bucket)
);
alter table private.api_quota enable row level security;
revoke all on table private.api_quota from public, anon, authenticated;

-- Vrai : l'appel peut partir. Faux : plafond du compte (ou total horaire pour le modèle payant) atteint,
-- genre inconnu, ou appelant sans connexion. Les limites vivent ici : l'appelant ne choisit que le genre.
-- genius/recap : le total tous comptes pèse chaque compte au plus jusqu'à son propre plafond.
-- ponytail: fenêtre fixe d'une heure ; total lu puis incrémenté sans verrou (léger dépassement possible en rafale).
create or replace function public.take_quota(p_kind text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  b timestamptz := date_trunc('hour', now());
  lim_user integer;
  lim_all integer;
  total bigint;
  c integer;
begin
  if me is null or p_kind is null then return false; end if;
  -- décision Louis : par compte et par heure ; total horaire tous comptes pour l'IA
  select v.par_compte, v.tous into lim_user, lim_all
  from (values ('genius', 20, 200), ('recap', 20, 200), ('turn', 60, null), ('events', 120, null))
       as v(genre, par_compte, tous)
  where v.genre = p_kind;
  if lim_user is null
     and p_kind ~ '^push:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    lim_user := 60;  -- par paire expéditeur -> cible
  end if;
  if lim_user is null then return false; end if;
  delete from private.api_quota where bucket < b;  -- heures passées, tous comptes
  if lim_all is not null then
    select coalesce(sum(least(q.n, lim_user)), 0) into total
    from private.api_quota q where q.kind = p_kind and q.bucket = b;
    if total >= lim_all then return false; end if;
  end if;
  insert into private.api_quota as q (user_id, kind, bucket, n)
  values (me, p_kind, b, 1)
  on conflict (user_id, kind, bucket) do update set n = q.n + 1
  returning q.n into c;
  return c <= lim_user;
end;
$$;
revoke all on function public.take_quota(text) from public, anon;
grant execute on function public.take_quota(text) to authenticated;

notify pgrst, 'reload schema';
