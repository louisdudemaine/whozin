-- Lot 2 — partie I : comptes 16-17 ans (brainstorm 13-11 n° 4, vague 0 ; 10-11 #27).
-- Une seule règle, private.peut_joindre(a, b) = « a peut joindre b » : b est majeur·e (date connue, jour civil
-- de Montréal), ou b = a, ou a et b sont ami·es mutuel·les. Une paire qui compte une personne de 16-17 ans exige
-- donc l'amitié mutuelle, dans les deux sens. Date de naissance absente = protégé·e comme 16-17 (même choix que
-- les rencontres : is_adult(null) = faux).
-- Refus nommés (PostgREST -> HTTP 400 ; les écrans lisent le code, comme WZ001) :
--   WZ002 réservé aux ami·es mutuel·les : suivre en premier, écrire, appeler, entrer dans un groupe ;
--   WZ003 bar ou club, 18 ans et plus : check-in, réservation ;
--   WZ004 demande en attente entre non-ami·es : ni photo ni lien, pour tout le monde (Apple 1.2).
-- Contrats inchangés : les binaires 9 à 11 restent compatibles ; seuls leurs messages d'erreur restent génériques.
-- Choix par défaut (à confirmer par Louis) : date absente = protégé·e ; deux 16-17 ne se trouvent pas encore
-- entre eux (viendra avec l'ajout face à face, n° 7) ; c'est une barrière raisonnable, pas une vérification d'âge.
-- La même migration retire le faux qui restait dans les données (comptes démo animés) et tient les durées de
-- conservation promises (§ 13 et 14).

set local lock_timeout = '5s';  -- échoue net au lieu de bloquer : relancer hors de :00/:15/:30/:45

-- 0. Majorité au jour civil de Montréal, comme private.age_ok (now()::date est la date UTC).
create or replace function public.is_adult(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and birthdate is not null
      and birthdate <= ((now() at time zone 'America/Montreal')::date - interval '18 years')::date
  );
$$;

-- 1. La règle.
create or replace function private.peut_joindre(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a = b or public.is_adult(b) or public.is_mutual_friend(a, b);
$$;
revoke all on function private.peut_joindre(uuid, uuid) from public, anon;
grant execute on function private.peut_joindre(uuid, uuid) to authenticated;  -- lue par les policies

-- 2. Profils : une 16-17 n'est lisible que d'elle-même, de ses ami·es mutuel·les et des gens qu'elle suit
--    (elle a fait le premier pas : ils la voient et peuvent la suivre en retour). /u/<pseudo> rend « 404 ».
alter policy profiles_select_all on public.profiles
  to authenticated
  using (
    private.peut_joindre((select auth.uid()), id)
    or exists (select 1 from public.follows f
                where f.follower_id = profiles.id and f.following_id = (select auth.uid()))
  );

-- 3. Suivre : en premier, seulement une personne majeure ; une 16-17, seulement en retour.
--    Déclencheur et non policy : code nommé, et join_squad (definer, hors RLS) passe aussi par ici.
create or replace function private.suivi_permis()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- suivi au nom d'autrui : la RLS le refuse ; ne rien révéler avant elle
  if auth.uid() is not null and new.follower_id is distinct from auth.uid() then return new; end if;
  if not private.peut_joindre(new.follower_id, new.following_id)
     and not exists (select 1 from public.follows f
                      where f.follower_id = new.following_id and f.following_id = new.follower_id) then
    raise exception 'Cette personne choisit qui la suit.' using errcode = 'WZ002';
  end if;
  return new;
end;
$$;
revoke all on function private.suivi_permis() from public, anon, authenticated;
drop trigger if exists trg_a_suivi_permis on public.follows;
create trigger trg_a_suivi_permis before insert on public.follows
  for each row execute function private.suivi_permis();

-- 4. Conversations et groupes : qui entre doit pouvoir joindre chaque membre déjà là, dans les deux sens.
--    Un seul point pour get_or_create_conversation, create_group_conversation, join_squad (avant son suivi
--    mutuel automatique), respond_beacon et dating_like. Plpgsql VOLATILE : dans un INSERT de plusieurs
--    lignes, chaque ligne voit les précédentes.
create or replace function private.membre_permis()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.conversations where id = new.conversation_id for update;
  if exists (select 1 from public.conversation_members m
              where m.conversation_id = new.conversation_id and m.user_id <> new.user_id
                and not (private.peut_joindre(new.user_id, m.user_id)
                         and private.peut_joindre(m.user_id, new.user_id))) then
    raise exception 'Réservé aux ami·es mutuel·les.' using errcode = 'WZ002';
  end if;
  return new;
end;
$$;
revoke all on function private.membre_permis() from public, anon, authenticated;
drop trigger if exists trg_a_membre_permis on public.conversation_members;
create trigger trg_a_membre_permis before insert on public.conversation_members
  for each row execute function private.membre_permis();

-- 5. Écrire à deux : fermé si la règle ne tient plus (anciennes demandes, amitié défaite) ; une demande en
--    attente entre non-ami·es reste du texte sans lien jusqu'à la réponse (Apple 1.2). trg_a_m… part avant
--    trg_a_texte_interdit et trg_stash_snap (qui vide image_url d'un snap).
create or replace function private.message_permis()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.conversations%rowtype;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if c.id is null or c.is_group
     or (new.sender_id is distinct from c.user_a and new.sender_id is distinct from c.user_b)
     or public.blocked_between(c.user_a, c.user_b)
     or (auth.uid() is not null and new.sender_id is distinct from auth.uid()) then
    return new;  -- groupe : contrôlé à l'entrée (point 4) ; non-membre, blocage : la policy refuse comme avant
  end if;
  if not (private.peut_joindre(c.user_a, c.user_b) and private.peut_joindre(c.user_b, c.user_a)) then
    raise exception 'Réservé aux ami·es mutuel·les.' using errcode = 'WZ002';
  end if;
  -- ponytail: liste de domaines courte ; « insta: … » ou « w w w » passent. Allonger si on les voit en vrai.
  if c.status = 'pending' and c.requested_by = new.sender_id
     and not public.is_mutual_friend(c.user_a, c.user_b)
     and (new.image_url is not null or new.view_once or new.poll_id is not null
          -- un nom de domaine commence par une lettre et compte au moins 3 caractères : « 22h.ca » passe
          or coalesce(new.body, '') ~* '(https?://|www\.|\m[a-z][a-z0-9-]{2,}\.(com|ca|net|org|io|app|me|ly|gg|co|tv|link|xyz|fr|qc)\M)') then
    raise exception 'Pas de photo ni de lien avant que la personne accepte ta demande.' using errcode = 'WZ004';
  end if;
  return new;
end;
$$;
revoke all on function private.message_permis() from public, anon, authenticated;
drop trigger if exists trg_a_message_permis on public.messages;
create trigger trg_a_message_permis before insert on public.messages
  for each row execute function private.message_permis();

-- 6. Bars et clubs : 18 ans et plus au Québec. Ni check-in ni réservation sans majorité connue.
create or replace function private.lieu_18_plus()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then return new; end if;  -- la RLS refuse
  if not public.is_adult(new.user_id)
     and exists (select 1 from public.places p where p.id = new.place_id and p.category in ('bar', 'club')) then
    raise exception 'Bars et clubs : 18 ans et plus.' using errcode = 'WZ003';
  end if;
  return new;
end;
$$;
revoke all on function private.lieu_18_plus() from public, anon, authenticated;
drop trigger if exists trg_a_lieu_18_plus on public.check_ins;
create trigger trg_a_lieu_18_plus before insert on public.check_ins
  for each row execute function private.lieu_18_plus();
drop trigger if exists trg_a_lieu_18_plus on public.reservations;
create trigger trg_a_lieu_18_plus before insert on public.reservations
  for each row execute function private.lieu_18_plus();

-- 7. Ce qu'elle publie : « public » ne sort pas de ses ami·es mutuel·les (likes, commentaires et leurs
--    notifications suivent : can_see_post lit cette policy) ; ses stories pareil ; « Vu par » ne compte que
--    des stories lisibles.
alter policy posts_select_visible on public.posts
  to authenticated
  using (
    user_id = auth.uid()
    or (
      ((visibility = 'public' and private.peut_joindre((select auth.uid()), user_id))
       or (visibility = 'friends' and private.mutual_with(user_id)))
      and not private.blocked_with(user_id)
      and not private.signale_par_moi('post', id)
    )
  );

alter policy stories_select_visible on public.stories
  to authenticated
  using (user_id = (select auth.uid())
         or (expires_at > now() and not private.blocked_with(user_id) and not private.signale_par_moi('story', id)
             and private.peut_joindre((select auth.uid()), user_id)));

alter policy story_views_insert_own on public.story_views
  to authenticated
  with check (viewer_id = auth.uid()
              and exists (select 1 from public.stories s where s.id = story_views.story_id));

-- 7 bis. Ses commentaires et ses likes sous la publication d'un tiers : lisibles de ses ami·es mutuel·les et de
--        l'auteur de la publication, pas d'un adulte inconnu (qui pourrait lui répondre dans le fil). Les
--        notifications suivent : on ne notifie pas un auteur qui ne pourrait pas voir l'acteur.
alter policy comments_select_visible on public.comments
  to authenticated
  using (
    can_see_post(post_id)
    and (
      user_id = (select auth.uid())
      or (
        not private.blocked_with(user_id)
        and (
          private.peut_joindre((select auth.uid()), user_id)
          or exists (select 1 from public.posts p
                      where p.id = comments.post_id and p.user_id = (select auth.uid()))
        )
      )
    )
  );

alter policy likes_select_visible on public.likes
  to authenticated
  using (can_see_post(post_id)
         and (user_id = (select auth.uid())
              or private.peut_joindre((select auth.uid()), user_id)
              or exists (select 1 from public.posts p where p.id = likes.post_id and p.user_id = (select auth.uid()))));

CREATE OR REPLACE FUNCTION public.notify_on_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare author uuid;
begin
  select user_id into author from public.posts where id = new.post_id;
  if author is not null and author <> new.user_id and private.peut_joindre(author, new.user_id) then
    insert into public.notifications (user_id, actor_id, type, post_id)
    values (author, new.user_id, 'comment', new.post_id);
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.notify_on_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare author uuid;
begin
  select user_id into author from public.posts where id = new.post_id;
  if author is not null and author <> new.user_id and private.peut_joindre(author, new.user_id)
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
$function$;

-- 8. Suggestions : personne de l'autre côté de la règle, dans un sens ni dans l'autre.
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
    -- 16-17 : jamais suggéré·e à qui n'est pas ami·e ; aucun adulte inconnu suggéré à un·e 16-17
    and private.peut_joindre((select uid from me), p.id) and private.peut_joindre(p.id, (select uid from me))
  order by s.score desc limit least(greatest(coalesce(lim, 12), 1), 50);
$$;

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
    and private.peut_joindre((select uid from me), p.id) and private.peut_joindre(p.id, (select uid from me))  -- 16-17
  group by p.id order by score desc limit lim;
$$;

-- 9. Appeler et pousser : une ancienne conversation acceptée, un lien de gardien ou une réservation ne
--    suffisent plus avec une 16-17 qui n'est pas amie (/api/push envoie un texte libre).
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
      and private.peut_joindre(c.user_a, c.user_b) and private.peut_joindre(c.user_b, c.user_a)  -- 16-17
  );
$$;

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
    and private.peut_joindre(auth.uid(), target) and private.peut_joindre(target, auth.uid())  -- 16-17
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

-- 9 bis. Appels : refus nommé (WZ002) quand la paire n'est plus compatible. Ange gardien : l'amitié est exigée
--        tant que le lien dure. Groupes : un membre incompatible est sauté (avant : tout le groupe était refusé).
CREATE OR REPLACE FUNCTION public.ring_call(conv uuid, call_id uuid, call_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  me uuid := auth.uid();
  callee uuid;
  caller jsonb;
begin
  if me is null then raise exception 'auth requise'; end if;
  if call_id is null or call_kind is null or call_kind not in ('audio', 'video') then
    raise exception 'appel invalide';
  end if;
  if exists (select 1 from public.conversations c
              where c.id = conv and not c.is_group and auth.uid() in (c.user_a, c.user_b)
                and not (private.peut_joindre(c.user_a, c.user_b) and private.peut_joindre(c.user_b, c.user_a))) then
    raise exception 'Réservé aux ami·es mutuel·les.' using errcode = 'WZ002';
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
$function$;

CREATE OR REPLACE FUNCTION public.my_proteges()
 RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, active_until timestamp with time zone, last_place text, last_seen timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p.id, p.username, p.display_name, p.avatar_url, gl.active_until,
    (select pl.name from public.check_ins ci join public.places pl on pl.id = ci.place_id
      where ci.user_id = p.id and ci.expires_at > gl.created_at
      order by ci.created_at desc limit 1),
    (select max(ci.created_at) from public.check_ins ci
      where ci.user_id = p.id and ci.expires_at > gl.created_at)
  from public.guardian_links gl join public.profiles p on p.id = gl.user_id
  where gl.guardian_id = auth.uid() and gl.active_until > now()
    and not public.blocked_between(gl.user_id, gl.guardian_id)
    and public.is_mutual_friend(gl.user_id, gl.guardian_id);  -- amitié défaite : le gardien ne voit plus rien
$function$;

CREATE OR REPLACE FUNCTION public.create_group_conversation(group_title text, members uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
       and not public.blocked_between(me, m)
       -- 16-17 : un membre incompatible avec quelqu'un déjà là est sauté, comme un non-ami
       and not exists (select 1 from public.conversation_members x
                        where x.conversation_id = cid and x.user_id <> m
                          and not (private.peut_joindre(m, x.user_id) and private.peut_joindre(x.user_id, m))) then
      insert into public.conversation_members (conversation_id, user_id) values (cid, m) on conflict do nothing;
    end if;
  end loop;
  return cid;
end;
$function$;

-- 10. Aperçu d'un lien de groupe : rien si l'entrée serait refusée (la page dit « Invitation invalide ou expirée. »).
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
    and not public.blocked_between(auth.uid(), s.inviter_id)
    and private.peut_joindre(auth.uid(), s.inviter_id) and private.peut_joindre(s.inviter_id, auth.uid())
    and not exists (select 1 from public.conversation_members cm
                     where cm.conversation_id = c.id and cm.user_id <> auth.uid()
                       and not (private.peut_joindre(auth.uid(), cm.user_id)
                                and private.peut_joindre(cm.user_id, auth.uid())));
$$;

-- 11. Ange gardien : pas d'oracle sur le pseudo d'une 16-17 (même réponse qu'un pseudo inconnu).
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
  if not private.peut_joindre(me, g.id) then raise exception 'introuvable'; end if;  -- 16-17 non amie
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

-- 12. (optionnel, voir point 16) Graphe d'abonnements : les liens d'une 16-17 ne se lisent que de ses ami·es.
alter policy follows_select_all on public.follows
  to authenticated
  using (follower_id = (select auth.uid()) or following_id = (select auth.uid())
         or (private.peut_joindre((select auth.uid()), follower_id)
             and private.peut_joindre((select auth.uid()), following_id)));


-- 12 bis. Sismographe : la série horaire suit aussi le seuil de 3 (une heure à 1 ou 2 personnes compte 0).
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
    -- seuil d'anonymat : une heure où moins de 3 personnes distinctes sont sorties compte 0
    select b.h, case when count(distinct ci.user_id) >= 3 then count(ci.id)::int else 0 end as n
    from buckets b
    left join public.check_ins ci
      on ci.created_at >= b.h and ci.created_at < b.h + interval '1 hour'
     and private.sees_check_in(null, ci.user_id, ci.hidden)
    group by b.h
  ),
  cur as (
    select (case when count(distinct ci.user_id) >= 3 then count(*) else 0 end)::numeric n from public.check_ins ci
    where ci.created_at > now() - interval '2 hours'
      and private.sees_check_in(null, ci.user_id, ci.hidden)
  ),
  hist as (
    -- même fenêtre de 2h, moyenne des 7 derniers jours
    select greatest(avg(day_n), 0.5) as avg_n from (
      select case when count(distinct ci.user_id) >= 3 then count(ci.id) else 0 end as day_n
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

-- =====================================================================================
-- 13. Faux dans les données : les 5 comptes démo restent (le compte d'essai est leur ami mutuel), mais on
--     cesse de les animer et de les montrer à tout le monde.
-- =====================================================================================
select cron.unschedule(jobid) from cron.job where jobname = 'whozin-demo-presence';
drop function if exists public.refresh_demo_presence();
update public.check_ins set expires_at = now()
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
                   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
                   '55555555-5555-5555-5555-555555555555')
   and expires_at > now();
-- Leurs publications ne vont plus qu'à leurs ami·es, sans les photos d'exemple de picsum.photos (fausses, et
-- chargées chez un tiers) : la contrainte posts_photo_url_source, revérifiée à toute modification de la ligne,
-- refuserait sinon la mise à jour. Le texte reste.
update public.posts
   set visibility = 'friends',
       photo_url = case
         when photo_url ~ ('^https://aovuweoehzflydjtxpdr\.supabase\.co/storage/v1/object/public/media/'
                           || user_id::text || '/[A-Za-z0-9._-]+$') then photo_url
       end
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
                   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
                   '55555555-5555-5555-5555-555555555555')
   and visibility = 'public';

-- Leur date de naissance est effacée : la règle 16-17 les rend protégés, donc invisibles de quiconque n'est
-- pas leur ami·e mutuel·le (le compte d'essai l'est) ; et ils sortent des rencontres.
update public.profiles set birthdate = null
 where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
              '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
              '55555555-5555-5555-5555-555555555555');
update public.dating_profiles set enabled = false
 where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
                   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
                   '55555555-5555-5555-5555-555555555555');

-- =====================================================================================
-- 14. Conservation (Loi 25) : ce que la politique promet, la base le fait.
-- =====================================================================================
-- Historiques : check-ins 90 j (la plus longue lecture est 60 j : prévision, crew, partenaire, proactive_scan),
-- notifications « un·e ami·e est sorti·e » 1 j et les autres 30 j, balises et liens d'ange gardien expirés
-- depuis 1 j, stories (et leurs vues, en cascade) 1 j après leurs 24 h.
create or replace function private.purge_historique()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.check_ins where created_at < now() - interval '90 days';
  delete from public.notifications
   where created_at < now() - case when type in ('move', 'crew_out') then interval '1 day' else interval '30 days' end;
  delete from public.beacons where expires_at < now() - interval '1 day';
  delete from public.guardian_links where active_until < now() - interval '1 day';
  delete from public.stories where expires_at < now() - interval '1 day';
$$;
revoke all on function private.purge_historique() from public, anon, authenticated;
select cron.schedule('purge-historique', '27 9 * * *', 'select private.purge_historique();');  -- 4 h 27 à Montréal

-- Fichiers du bucket public « media » que plus rien ne cite (story expirée, publication refusée, compte
-- effacé par l'API) : la fonction Edge purge-chat les retire avec ceux du bucket chat (même jeton Vault).
-- Une photo d'un signalement ouvert reste.
create or replace function public.media_a_purger(jeton text, lim integer default 500)
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
      from storage.objects o,
           lateral (select 'https://aovuweoehzflydjtxpdr.supabase.co/storage/v1/object/public/media/' || o.name as url) u
     where o.bucket_id = 'media'
       and not o.is_delete_marker
       and o.created_at < now() - interval '1 hour'  -- dépôt puis publication : jamais un fichier en cours d'envoi
       and not exists (select 1 from public.posts p where p.photo_url = u.url)
       and not exists (select 1 from public.profiles pr where pr.avatar_url = u.url)
       and not exists (select 1 from public.stories s where s.media_url = u.url and s.expires_at > now())
       and not exists (select 1 from public.reports r where r.resolved_at is null and r.snapshot ->> 'chemin' = u.url)
     order by o.created_at
     limit greatest(1, least(coalesce(lim, 500), 1000))
  );
end;
$$;
revoke all on function public.media_a_purger(text, integer) from public, anon, authenticated;
grant execute on function public.media_a_purger(text, integer) to service_role;

-- Gardes : la migration échoue plutôt que de laisser la règle à moitié posée.
do $$
begin
  if (select count(*) from pg_trigger
       where not tgisinternal
         and tgname in ('trg_a_suivi_permis', 'trg_a_membre_permis', 'trg_a_message_permis', 'trg_a_lieu_18_plus')) <> 5 then
    raise exception 'un déclencheur 16-17 manque';
  end if;
  if exists (select 1 from cron.job where jobname = 'whozin-demo-presence') then
    raise exception 'le cron des comptes démo tourne encore';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename in ('profiles', 'follows', 'posts', 'stories')
                and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE'
              group by tablename having count(*) > 1) then
    raise exception 'une deuxième policy de lecture contournerait la règle 16-17';
  end if;
end;
$$;

-- RETOUR ARRIÈRE (dans cet ordre) :
--   drop trigger trg_a_suivi_permis on public.follows ; drop trigger trg_a_membre_permis on public.conversation_members ;
--   drop trigger trg_a_message_permis on public.messages ; drop trigger trg_a_lieu_18_plus on public.check_ins ;
--   drop trigger trg_a_lieu_18_plus on public.reservations ;
--   alter policy profiles_select_all on public.profiles using (true) ; alter policy follows_select_all on public.follows using (true) ;
--   posts_select_visible et stories_select_visible : textes de la partie H ; story_views_insert_own with check (viewer_id = auth.uid()) ;
--   reprendre de lotI/fonctions.sql : is_adult, suggested_people, popular_people, can_call, can_push, squad_invite_preview, guardian_start ;
--   puis drop function private.suivi_permis(), private.membre_permis(), private.message_permis(), private.lieu_18_plus(),
--   private.peut_joindre(uuid, uuid).
--   § 13 : recréer public.refresh_demo_presence() depuis lotI/fonctions.sql puis
--     select cron.schedule('whozin-demo-presence', '*/15 * * * *', 'select public.refresh_demo_presence();') ;
--     posts démo : update public.posts set visibility = 'public' where user_id in (…5 uuid…) and visibility = 'friends'
--     (les photos picsum retirées ne reviennent pas : c'étaient de fausses photos d'exemple) ;
--     dates : aria_mtl 2003-04-12, maxlevesque 1999-09-03, lea_tremblay 2001-12-21, sam_co 2000-06-30, noah_dub 2002-02-14 ;
--     rencontres : update public.dating_profiles set enabled = true where user_id in (…5 uuid…).
--   § 7 bis, 9 bis : reprendre de lotI/fonctions.sql notify_on_comment, notify_on_like, ring_call, my_proteges,
--     create_group_conversation ; policies comments/likes d'origine (lotI/policies.json).
--   § 14 : select cron.unschedule('purge-historique') ; drop function private.purge_historique(), public.media_a_purger(text, integer).
