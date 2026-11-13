-- Lot 2 — partie G : la présence d'une personne n'est visible que de ses ami·es mutuel·les.
-- Avant : la policy check_ins_select_visible laissait tout compte connecté lire le nom et le lieu exact de
-- quiconque n'était pas en mode Caché (le mode par défaut « approximatif » ne floutait rien), et
-- private.sees_check_in, appelée par les fonctions definer, ne vérifiait jamais l'amitié : « Ton crew »,
-- le récap de soirée (croisé·es), « Vu IRL », « Ton crew est sorti » (Pour toi et notifications crew_out)
-- et « Vous vous êtes croisés » (rencontres) nommaient et situaient des inconnus.
-- Après : un viewer nommé ne voit que lui-même ou un·e ami·e MUTUEL·LE non bloqué·e (une seule fonction
-- corrige tous ses appelants) ; les autres ne sont qu'un nombre, jamais sous 3 personnes distinctes
-- (places_nearby, Pour toi, tableau partenaire, prévision sur jours clos, pouls de la ville ; widget public en
-- paliers ; score de goût des suggestions et des rencontres sans les sorties en cours).
-- Contrats inchangés (mêmes signatures, colonnes et types) : les binaires déjà installés restent compatibles.
-- Seul changement de sens : active_checkins compte des PERSONNES distinctes, plus des lignes.

-- 1. Racine : viewer null = agrégat anonyme (le seuil est chez l'appelant) ; viewer nommé = soi ou ami·e mutuel·le.
create or replace function private.sees_check_in(viewer uuid, author uuid, made_hidden boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not coalesce(made_hidden, false)
    and private.shares_location(author)
    and (viewer is null
         or viewer = author
         or (public.is_mutual_friend(viewer, author) and not public.blocked_between(viewer, author)));
$$;
revoke all on function private.sees_check_in(uuid, uuid, boolean) from public, anon, authenticated;

-- 2. Présence affichable à l'appelant, en personnes distinctes : moi + ami·es mutuel·les non bloqué·es,
--    exactement ; les autres seulement s'ils sont au moins 3 (sinon 0). Les autres sont comptés sans
--    regarder les blocages (viewer null) : sinon bloquer puis débloquer quelqu'un ferait varier le compte
--    du lieu où il est.
create or replace function private.presence_count(p_place uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) filter (where proche)
       + case when count(*) filter (where not proche) >= 3 then count(*) filter (where not proche) else 0 end
  from (
    select distinct ci.user_id,
      coalesce(ci.user_id = auth.uid()
               or (private.mutual_with(ci.user_id) and not private.blocked_with(ci.user_id)), false) as proche
    from public.check_ins ci
    where ci.place_id = p_place and ci.expires_at > now()
      and (ci.user_id = auth.uid() or private.sees_check_in(null, ci.user_id, ci.hidden))
  ) v;
$$;
revoke all on function private.presence_count(uuid) from public, anon, authenticated;

-- 3. places_nearby passe en definer (elle comptait sous la RLS : après le point 8, la carte n'aurait
--    plus montré que les ami·es). Même signature, mêmes colonnes ; create or replace garde les droits.
create or replace function public.places_nearby(in_lat double precision, in_lng double precision, radius_m integer default 5000)
returns table(id uuid, name text, category text, address text, lat double precision, lng double precision,
              created_at timestamp with time zone, distance_m double precision, active_checkins bigint)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select x.id, x.name, x.category, x.address, x.lat, x.lng, x.created_at, x.distance_m,
         private.presence_count(x.id) as active_checkins
  from (
    select pl.id, pl.name, pl.category, pl.address, pl.lat, pl.lng, pl.created_at,
           ST_Distance(pl.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography) as distance_m
    from public.places pl
    where ST_DWithin(pl.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography, radius_m)
    order by distance_m
    limit 200
  ) x
  order by x.distance_m;  -- ponytail: presence_count par lieu (200 max) ; dénormaliser si la carte rame
$$;
revoke all on function public.places_nearby(double precision, double precision, integer) from public, anon;
grant execute on function public.places_nearby(double precision, double precision, integer) to authenticated;

-- 4 à 7. Compteurs agrégés : anonymes (viewer null) et seuil de 3 ; sinon, après le point 1, ils ne
--        compteraient plus que les ami·es (tableau partenaire et prévision vides).


-- 4. Tableau du partenaire du lieu
CREATE OR REPLACE FUNCTION public.partner_place_stats(p_place uuid)
 RETURNS TABLE(active_now bigint, checkins_30d bigint, uniques_30d bigint, peak_hour integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with v as (
    select ci.user_id, ci.created_at, ci.expires_at
    from public.check_ins ci
    where ci.place_id = p_place
      and (ci.expires_at > now() or ci.created_at > now() - interval '60 days')
      and private.sees_check_in(null, ci.user_id, ci.hidden)  -- agrégat anonyme : même chiffre pour tous
  )
  select
    -- Seuil d'anonymat : sous 3 personnes distinctes, 0.
    (select case when count(distinct user_id) >= 3 then count(*) else 0 end from v where expires_at > now()),
    (select case when count(distinct user_id) >= 3 then count(*) else 0 end from v where created_at > now() - interval '30 days'),
    (select case when count(distinct user_id) >= 3 then count(distinct user_id) else 0 end from v where created_at > now() - interval '30 days'),
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
$function$;

-- 5. Prévision d'affluence
CREATE OR REPLACE FUNCTION public.place_forecast(p_place uuid)
 RETURNS TABLE(peak_hour integer, confidence integer, samples bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with v as (
    select ci.user_id, extract(hour from ci.created_at at time zone 'America/Montreal')::int as h
    from public.check_ins ci
    where ci.place_id = p_place and ci.created_at > now() - interval '60 days'
      and private.sees_check_in(null, ci.user_id, ci.hidden)
      -- jours clos seulement : samples ne bouge plus à chaque arrivée (sinon on daterait une personne seule)
      and ci.created_at < date_trunc('day', now() at time zone 'America/Montreal') at time zone 'America/Montreal'
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
$function$;

-- 6. Pour toi : seul « le lieu qui décolle » change (presence_count)
CREATE OR REPLACE FUNCTION public.for_you_now()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      -- ponytail: un presence_count par lieu actif ; agréger en une requête si le nombre de lieux actifs monte
      select a.place_id, private.presence_count(a.place_id) cnt
      from (select distinct ci.place_id from public.check_ins ci where ci.expires_at > now()) a
      order by 2 desc limit 1
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
$function$;

-- 7. Pouls de la ville
CREATE OR REPLACE FUNCTION public.city_pulse()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    group by pl.category having count(distinct ci.user_id) >= 3 order by n desc limit 1
  )
  select jsonb_build_object(
    'series', (select jsonb_agg(jsonb_build_object('h', to_char(h at time zone 'America/Montreal', 'HH24h'), 'n', n) order by h) from counts),
    'live_now', (select case when count(distinct ci.user_id) >= 3 then count(*)::int else 0 end from public.check_ins ci
                 where ci.expires_at > now() and private.sees_check_in(null, ci.user_id, ci.hidden)),
    'magnitude', (select least(round((cur.n / hist.avg_n)::numeric, 1), 9.9) from cur, hist),
    'top_category', (select category from topcat),
    'top_category_n', coalesce((select n from topcat), 0)
  );
$function$;

-- 8. Widget public (anon) : paliers au lieu d'un nombre exact
CREATE OR REPLACE FUNCTION public.place_widget(pid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- paliers (3, 10, 25) : un total exact, moins la liste de ses ami·es, révélerait 1 ou 2 inconnus
    'active', (select case when act.n >= 25 then 25 when act.n >= 10 then 10 when act.n >= 3 then 3 end from act),
    'today', (select case when tod.u >= 3 then case when tod.n >= 25 then 25 when tod.n >= 10 then 10 else 3 end end from tod),
    'next_event', (select jsonb_build_object('title', e.title, 'starts_at', e.starts_at)
                   from public.partner_events e where e.place_id = p.id and e.starts_at > now()
                   order by e.starts_at limit 1)
  )
  from public.places p where p.id = pid;
$function$;

-- Suggestions de personnes : le score de goût (agrégat anonyme) ne compte plus les check-ins en cours ni du jour, et la
-- liste est plafonnée à 50 ; sinon, en le relisant, on verrait un compte nommé sortir et rentrer.
CREATE OR REPLACE FUNCTION public.suggested_people(lim integer DEFAULT 12)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, bio text, reason text, shared integer, score numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
          and ci.expires_at < now() - interval '1 day'  -- clos depuis un jour : le score ne trahit pas une sortie en cours
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
  order by s.score desc limit least(greatest(coalesce(lim, 12), 1), 50);
$function$;

-- Rencontres (candidats) : le score de goût (agrégat anonyme) ne compte plus les check-ins en cours ni du jour, et la
-- liste est plafonnée à 50 ; sinon, en le relisant, on verrait un compte nommé sortir et rentrer.
CREATE OR REPLACE FUNCTION public.dating_candidates(lim integer DEFAULT 30)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, bio text, vibe text, age integer, compat numeric, crossed_place text, crossed_emoji text, crossed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
          and ci.expires_at < now() - interval '1 day'  -- clos depuis un jour : le score ne trahit pas une sortie en cours
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
  order by (cr.uid is not null) desc, compat desc, random() limit least(greatest(coalesce(lim, 12), 1), 50);
$function$;

-- 9. Lecture directe des check-ins : soi, ou un·e ami·e mutuel·le non bloqué·e qui partage sa position.
--    (fonctions de la policy accordées à authenticated : shares_location, mutual_with, blocked_with)
alter policy check_ins_select_visible on public.check_ins
  to authenticated
  using (
    user_id = (select auth.uid())
    or (expires_at > now()
        and not hidden
        and private.shares_location(user_id)
        and private.mutual_with(user_id)
        and not private.blocked_with(user_id))
  );

-- RETOUR ARRIÈRE : reprendre les définitions relevées en prod le 2026-11-13 (scratchpad lotG/fonctions.sql)
-- pour places_nearby (invoker, count(*)), partner_place_stats, place_forecast, for_you_now, city_pulse et
-- place_widget ; sees_check_in d'origine :
--   select not coalesce(made_hidden, false) and private.shares_location(author)
--     and (viewer is null or not public.blocked_between(viewer, author));
-- policy d'origine : (user_id = auth.uid()) OR ((expires_at > now()) AND (NOT hidden)
--   AND private.shares_location(user_id) AND (NOT private.blocked_with(user_id)))
-- drop function private.presence_count(uuid);
