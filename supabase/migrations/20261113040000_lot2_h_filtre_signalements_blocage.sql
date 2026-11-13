-- Lot 2 — partie H : filtre de mots interdits, signalements gardés pour l'examen, blocage complet.
-- Apple 1.2 (contenu des utilisateurs) et promesses de /conditions :
-- A. Un texte qui contient un mot interdit (liste en table, mots ENTIERS, accents et « leet » ramenés)
--    est refusé à l'écriture par un déclencheur, avec le code WZ001 que les écrans traduisent en refus
--    nommé. Les lignes anciennes ne sont jamais rejugées. À l'inscription, le nom est neutralisé (pas
--    d'erreur, sinon le lien de confirmation casserait).
-- B. Un signalement fige une copie de ce que le signaleur voyait (texte, chemin de photo, auteur, date),
--    illisible par les utilisateurs et effacée 90 jours après la décision ; la photo d'un MESSAGE signalé
--    (bucket chat) n'est plus purgée ni effaçable tant que le signalement est ouvert (les photos du bucket
--    public media restent effaçables par leur auteur : la copie n'en garde que l'adresse) ; le signaleur ne
--    revoit plus la publication, la story ou le message signalé.
-- C. Bloquer cache aussi les anciens messages, les messages de groupe (Realtime compris), la conversation
--    à deux et les commentaires de la personne, dans les deux sens ; mes propres messages restent.
-- Louis résout un signalement à la main : update public.reports set resolved_at = now() where id = '…';

-- =====================================================================================
-- A. Filtre de contenu à l'écriture (Apple 1.2), sans IA ni unaccent
-- =====================================================================================

-- Liste en FORME NORMALISÉE (minuscules, sans accent, [a-z0-9]) : le CHECK refuse une entrée qui ne
-- pourrait jamais correspondre (« nègre » écrit avec l'accent serait une règle morte).
create table if not exists private.mots_interdits (
  mot text primary key check (mot ~ '^[a-z0-9]+$')
);
alter table private.mots_interdits enable row level security;
revoke all on table private.mots_interdits from public, anon, authenticated;

-- Mots ENTIERS, sans sens courant. Écartés exprès : retard (« en retard »), tapette (à mouches), pédale,
-- pede (portugais « il demande »), negro (espagnol/portugais « noir »), chink (« fissure »), coon, dyke,
-- fag (cigarette au R.-U.), kkk (le rire « kkkk » en portugais), bitch, pussy, cock, dick, cum (« cum laude »),
-- kike (surnom courant d'Enrique), et les sacres québécois (tabarnak, câlisse, crisse, ostie…) : jurons, pas
-- des insultes visant quelqu'un. À trancher par Louis : negre (catalan « noir »), termes réappropriés (gouine, fif).
insert into private.mots_interdits (mot) values
  ('nigger'), ('niggers'), ('nigga'), ('niggas'), ('spic'), ('spics'),
  ('wetback'), ('wetbacks'), ('raghead'), ('ragheads'), ('towelhead'), ('towelheads'), ('gook'), ('gooks'),
  ('negre'), ('negres'), ('negresse'), ('negresses'), ('bougnoule'), ('bougnoules'),
  ('youpin'), ('youpins'), ('youpine'), ('youpines'), ('chinetoque'), ('chinetoques'),
  ('faggot'), ('faggots'), ('fif'), ('fifs'), ('gouine'), ('gouines'), ('shemale'), ('shemales'),
  ('cunt'), ('cunts'), ('whore'), ('whores'), ('slut'), ('sluts'),
  ('salope'), ('salopes'), ('pute'), ('putes')
on conflict do nothing;

-- Vrai si un mot ENTIER du texte est dans la liste. Normalisation : caractères invisibles retirés,
-- minuscules, NFKD sans diacritiques, chiffres « leet » et homoglyphes cyrilliques traduits, découpe sur
-- tout ce qui n'est pas [a-z0-9]. Chaque mot est comparé tel quel, avec ses lettres répétées 3 fois ou plus
-- ramenées à deux (« niggggger »), puis, s'il est étiré, à une (« sluuut »).
-- ponytail: mots collés (« xxnigger ») et lettres espacées (« n i g g e r ») passent ; ajouter une
-- recherche de sous-chaîne sur une liste courte si on les voit en vrai.
create or replace function private.texte_interdit(t text)
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from unnest(regexp_split_to_array(
           translate(
             regexp_replace(
               normalize(lower(regexp_replace(coalesce(t, ''), '[\u00ad\u200b-\u200f\u2060\ufeff]', '', 'g')), NFKD),
               '[\u0300-\u036f]', '', 'g'),          -- accents (aussi décomposés) ; NFKD ramène la pleine chasse
             '0134579@$аеіорсху',                     -- chiffres « leet » et homoglyphes cyrilliques
             'oieastgasaeiopcxy'),
           '[^a-z0-9]+')) as m(mot)
    cross join lateral unnest(array[
      m.mot,
      regexp_replace(m.mot, '(.)\1{2,}', '\1\1', 'g'),
      case when m.mot ~ '(.)\1{2}' then regexp_replace(m.mot, '(.)\1+', '\1', 'g') end  -- « sluuut », pas « putte »
    ]) as f(forme)
    join private.mots_interdits i on i.mot = f.forme
  );
$$;
-- pas d'appel direct : ce serait un oracle sur la liste
revoke all on function private.texte_interdit(text) from public, anon, authenticated;

-- Une fonction, un déclencheur par table ; les colonnes à juger passent en arguments.
-- UPDATE : on ne rejuge pas un texte inchangé (sinon un mot ajouté plus tard à la liste bloquerait
-- read_at, location_sharing, etc. sur les lignes anciennes).
create or replace function private.refuser_texte_interdit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  col text;
  neuf jsonb := to_jsonb(new);
  ancien jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
begin
  foreach col in array tg_argv loop
    continue when ancien is not null and ancien -> col is not distinct from neuf -> col;
    if private.texte_interdit(neuf ->> col) then
      raise exception 'Ce texte contient un mot interdit par nos règles.'
        using errcode = 'WZ001',                      -- PostgREST -> HTTP 400 ; les clients lisent ce code
              detail = tg_table_name || '.' || col;   -- la colonne, jamais le mot
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.refuser_texte_interdit() from public, anon, authenticated;

-- Colonnes écrites par un client (table directe, ou RPC definer : set_move, create_group_conversation).
-- trg_a_… : les déclencheurs BEFORE partent par ordre alphabétique, celui-ci avant trg_stamp_ephemeral
-- et trg_stash_snap sur messages.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('posts',          array['body']),
      ('check_ins',      array['message']),
      ('messages',       array['body']),
      ('comments',       array['body']),
      ('stories',        array['caption']),
      ('beacons',        array['message']),
      ('moves',          array['body']),
      ('polls',          array['question']),
      ('poll_options',   array['label']),
      ('conversations',  array['title']),
      ('places',         array['name', 'address']),
      ('partner_events', array['title', 'description']),
      ('reservations',   array['note']),
      ('dating_profiles', array['vibe']),
      ('profiles',       array['username', 'display_name', 'bio', 'pro_title', 'pro_company', 'pro_industry', 'pro_linkedin'])
    ) v(tbl, cols)
  loop
    execute format('drop trigger if exists trg_a_texte_interdit on public.%I', r.tbl);
    execute format(
      'create trigger trg_a_texte_interdit before insert or update of %s on public.%I '
      'for each row execute function private.refuser_texte_interdit(%s)',
      (select string_agg(quote_ident(c), ', ') from unnest(r.cols) c),
      r.tbl,
      (select string_agg(quote_literal(c), ', ') from unnest(r.cols) c));
  end loop;
end;
$$;

-- Inscription : la fiche naît dans handle_new_user (création OU confirmation du courriel). Y lever une
-- erreur ferait échouer le lien de confirmation sans message, et AuthScreen prend tout refus pour l'âge.
-- On neutralise comme pour « whozin » : nom par défaut, nom affiché vide. Seul changement par rapport au
-- relevé du 13-11 : les deux « or private.texte_interdit(…) ».
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
  if uname is null or char_length(uname) < 2 or position('whozin' in lower(uname)) > 0
     or private.texte_interdit(uname) then
    uname := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  uname := left(uname, 30);
  if exists (select 1 from public.profiles where username = uname) then
    uname := left(uname, 25) || '_' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  -- le nom FINAL aussi (troncature ou suffixe hexadécimal peuvent en former un) : jamais d'erreur ici
  if private.texte_interdit(uname) then
    uname := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  dname := left(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 50);
  if position('whozin' in lower(coalesce(dname, ''))) > 0 or private.texte_interdit(dname) then dname := null; end if;

  insert into public.profiles (id, username, display_name, birthdate)
  values (new.id, uname, dname, bd)
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- =====================================================================================
-- B. Signalements : copie figée, hors purge, masqués pour le signaleur
-- =====================================================================================

alter table public.reports
  add column if not exists resolved_at timestamptz,
  add column if not exists snapshot jsonb;

create index if not exists reports_reporter_cible_idx on public.reports (reporter_id, target_type, target_id);
create index if not exists reports_chemin_ouvert_idx on public.reports ((snapshot ->> 'chemin')) where resolved_at is null;

-- Copie au moment du signalement. Seulement ce que le signaleur pouvait voir : un message de SA
-- conversation, une publication publique ou d'un ami mutuel. Sinon (ou message éphémère déjà purgé),
-- le signalement reste, sans copie.
create or replace function private.figer_signalement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.resolved_at := null;  -- ni la résolution ni la copie ne viennent du client
  new.snapshot := case new.target_type
    when 'message' then (
      select jsonb_build_object(
        'corps', m.body, 'chemin', coalesce(s.image_url, m.image_url), 'auteur', m.sender_id,
        'date', m.created_at, 'conversation', m.conversation_id, 'vue_unique', m.view_once)
      from public.messages m
      left join private.snaps s on s.message_id = m.id
      where m.id = new.target_id
        and public.is_conversation_participant(m.conversation_id))
    when 'post' then (
      select jsonb_build_object(
        'corps', p.body, 'chemin', p.photo_url, 'auteur', p.user_id, 'date', p.created_at,
        'visibilite', p.visibility, 'lieu', p.place_id)
      from public.posts p
      where p.id = new.target_id
        and (p.visibility = 'public' or (p.visibility = 'friends' and private.mutual_with(p.user_id))))
    when 'story' then (
      select jsonb_build_object(
        'corps', st.caption, 'chemin', st.media_url, 'auteur', st.user_id, 'date', st.created_at)
      from public.stories st
      where st.id = new.target_id)
    when 'profile' then (
      select jsonb_build_object(
        'corps', pr.bio, 'chemin', pr.avatar_url, 'auteur', pr.id, 'date', now(),
        'username', pr.username, 'display_name', pr.display_name,
        'pro_title', pr.pro_title, 'pro_company', pr.pro_company,
        'pro_industry', pr.pro_industry, 'pro_linkedin', pr.pro_linkedin)
      from public.profiles pr
      where pr.id = new.target_id)
  end;
  new.snapshot := coalesce(new.snapshot, jsonb_build_object('introuvable', true));
  return new;
end;
$$;
revoke all on function private.figer_signalement() from public, anon, authenticated;

drop trigger if exists trg_figer_signalement on public.reports;
create trigger trg_figer_signalement before insert on public.reports
  for each row execute function private.figer_signalement();

-- Aides des policies (definer : public.reports n'a AUCUNE policy SELECT, une sous-requête en invoker
-- n'y verrait jamais rien et le masquage serait muet).
create or replace function private.signale_par_moi(t text, cible uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.reports r
    where r.reporter_id = auth.uid() and r.target_type = t and r.target_id = cible
  );
$$;
revoke all on function private.signale_par_moi(text, uuid) from public, anon;
grant execute on function private.signale_par_moi(text, uuid) to authenticated;

create or replace function private.chemin_signale(obj text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.reports r
    where r.resolved_at is null and r.snapshot ->> 'chemin' = obj
  );
$$;
revoke all on function private.chemin_signale(text) from public, anon;
grant execute on function private.chemin_signale(text) to authenticated;

-- Purge du bucket « chat » : le relevé du 13-11 plus une condition (fichier d'un signalement ouvert).
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
       -- signalement pas encore examiné : la photo reste (le message, lui, peut être purgé : sa copie est dans reports)
       and not private.chemin_signale(o.name)
     order by o.created_at
     limit greatest(1, least(coalesce(lim, 500), 1000))
  );
end;
$$;

-- Ni l'auteur (propriétaire du fichier) ni celui qui ouvre un snap (forgetSnap) n'effacent une photo signalée.
drop policy if exists chat_delete on storage.objects;
create policy chat_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat'
    and (owner_id = (select auth.uid())::text or private.chat_object_ok(name, true))
    and not private.chemin_signale(name)
  );

-- Le signaleur ne revoit plus la publication signalée (fil, profil, explorer : post_feed est security_invoker).
alter policy posts_select_visible on public.posts
  to authenticated
  using (
    user_id = auth.uid()
    or (
      (visibility = 'public' or (visibility = 'friends' and private.mutual_with(user_id)))
      and not private.blocked_with(user_id)
      and not private.signale_par_moi('post', id)
    )
  );

-- =====================================================================================
-- C. Blocage complet : anciens messages, groupes, Realtime, conversation à deux
-- =====================================================================================

-- Table (boîte de réception, compteur de non-lus) ET Realtime (postgres_changes suit cette policy).
-- Mes messages restent ; ceux d'une personne bloquée (dans un sens ou l'autre) disparaissent, groupes compris ;
-- un message que j'ai signalé aussi.
alter policy messages_select_participant on public.messages
  to authenticated
  using (
    is_conversation_participant(conversation_id)
    and (expires_at is null or expires_at > now())
    and (sender_id = (select auth.uid()) or not private.blocked_with(sender_id))
    and not private.signale_par_moi('message', id)
  );

-- Le fil (RPC definer : ne passe pas par la policy) : mêmes deux conditions.
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
    and (m.sender_id = auth.uid() or not private.blocked_with(m.sender_id))
    and not private.signale_par_moi('message', m.id)
  order by m.created_at asc;
$$;

-- Une conversation à deux avec une personne bloquée sort de la boîte (elle revient au déblocage).
-- Le fil ouvert par lien redirige déjà vers /messages quand la conversation est introuvable.
alter policy conversations_select_participant on public.conversations
  to authenticated
  using (
    is_conversation_participant(id)
    and (is_group or not private.blocked_with(case when user_a = (select auth.uid()) then user_b else user_a end))
  );

-- Commentaires : ceux d'une personne bloquée (dans un sens ou l'autre) disparaissent, sous tous les posts.
alter policy comments_select_visible on public.comments
  to authenticated
  using (can_see_post(post_id) and (user_id = (select auth.uid()) or not private.blocked_with(user_id)));

-- Stories : celle que j'ai signalée ne revient plus dans ma barre.
alter policy stories_select_visible on public.stories
  to authenticated
  using (user_id = (select auth.uid())
         or (expires_at > now() and not private.blocked_with(user_id) and not private.signale_par_moi('story', id)));

-- Balise : le titre du groupe recopie le nom de son auteur, jamais jugé s'il est ancien ; il est jugé ici.
CREATE OR REPLACE FUNCTION public.respond_beacon(b_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare me uuid := auth.uid(); b record; n int; cid uuid; owner_name text; titre text;
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
    titre := left('Sortie de ' || owner_name, 58);
    -- un nom ancien, jamais jugé, ne doit pas faire refuser le groupe (WZ001) : titre neutre
    if titre is null or private.texte_interdit(titre) then titre := 'Sortie'; end if;
    insert into public.conversations (is_group, title, created_by, status)
      values (true, titre || ' 🔦', b.user_id, 'accepted')
      returning id into cid;
    insert into public.conversation_members (conversation_id, user_id)
      select cid, b.user_id union select cid, user_id from public.beacon_responses where beacon_id = b_id
      on conflict do nothing;
    update public.beacons set conversation_id = cid where id = b_id;
  end if;

  return jsonb_build_object('responses', n, 'conversation_id', cid);
end;
$function$;

-- Conservation (Loi 25) : la copie d'un signalement est effacée 90 jours après la décision.
select cron.schedule('purge-signalements', '17 4 * * *',
  $cron$update public.reports set snapshot = null where resolved_at < now() - interval '90 days' and snapshot is not null$cron$);

-- =====================================================================================
-- Gardes : la migration échoue plutôt que de laisser un masquage muet
-- =====================================================================================
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.reports'::regclass) then
    raise exception 'RLS absente sur public.reports';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'reports' and cmd <> 'INSERT') then
    raise exception 'une policy laisse lire, modifier ou effacer public.reports';
  end if;
  if not exists (select 1 from pg_class c, unnest(c.reloptions) o
                  where c.oid = 'public.post_feed'::regclass
                    and o in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1')) then
    raise exception 'post_feed n''est pas security_invoker : le masquage du signaleur n''y vaudrait pas';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename in ('messages', 'posts', 'comments', 'conversations', 'stories')
                and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE'
              group by tablename having count(*) > 1) then
    raise exception 'une deuxième policy de lecture contournerait le masquage';
  end if;
end;
$$;

-- RETOUR ARRIÈRE (dans cet ordre) :
--   drop trigger trg_a_texte_interdit on public.<chaque table> ; drop trigger trg_figer_signalement on public.reports ;
--   reprendre de lotG/fonctions.sql (relevé du 13-11) handle_new_user, chat_a_purger et fetch_messages ;
--   policies d'origine : posts_select_visible ((user_id = auth.uid()) OR (((visibility = 'public') OR ((visibility = 'friends')
--   AND private.mutual_with(user_id))) AND (NOT private.blocked_with(user_id)))) ; messages_select_participant
--   is_conversation_participant(conversation_id) ; conversations_select_participant is_conversation_participant(id) ;
--   comments_select_visible can_see_post(post_id) ; chat_delete sans « and not private.chemin_signale(name) ».
--   select cron.unschedule('purge-signalements') ; stories_select_visible d'origine (user_id = auth.uid()) OR ((expires_at > now())
--   AND (NOT private.blocked_with(user_id))) ; respond_beacon de lotG/respond_beacon.sql.
--   Les colonnes resolved_at et snapshot de reports peuvent rester.
