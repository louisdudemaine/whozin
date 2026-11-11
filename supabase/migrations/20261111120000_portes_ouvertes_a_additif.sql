-- Portes ouvertes, lot 1 — partie A : ce qui S'AJOUTE.
-- Compatible avec le code déjà en ligne : rien n'est retiré ici. La partie B (restrictive)
-- ne s'applique qu'une fois le code qui appelle my_profile() et set_birthdate() déployé.

-- A1. Schéma hors API (PostgREST n'expose que public) pour les fonctions d'aide des policies :
--     elles ne sont pas appelables en RPC, donc pas d'oracle sur le mode « hidden » ni sur l'âge.
create schema if not exists private;
grant usage on schema private to authenticated;

-- A2. check_ins_select_visible lisait profiles.location_sharing avec les droits de l'appelant.
--     Même règle par une fonction definer, et la policy ne vaut plus pour l'appelant sans connexion
--     (il était déjà refusé, mais par accident : blocked_between ne lui est pas exécutable).
-- ponytail: un appel par ligne de check_ins ; dénormaliser la visibilité si le volume monte.
create or replace function private.shares_location(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.location_sharing <> 'hidden'
  );
$$;
revoke all on function private.shares_location(uuid) from public, anon;
grant execute on function private.shares_location(uuid) to authenticated;

alter policy check_ins_select_visible on public.check_ins
  to authenticated
  using (
    user_id = auth.uid()
    or (
      expires_at > now()
      and private.shares_location(user_id)
      and not public.blocked_between(auth.uid(), user_id)
    )
  );

-- A3. Sa propre fiche, toutes colonnes (setof : zéro ligne sans fiche, jamais une ligne de NULL).
create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.profiles where id = auth.uid();
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- A4. La date de naissance s'écrit UNE fois (elle porte la barrière 18+ des rencontres) :
--     après la partie B, la colonne n'est plus modifiable directement.
create or replace function public.set_birthdate(d date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'auth requise'; end if;
  if d is null
     or d < date '1900-01-01'
     or d > ((now() at time zone 'America/Montreal')::date - interval '16 years') then
    raise exception 'date de naissance invalide';
  end if;
  update public.profiles set birthdate = d where id = auth.uid() and birthdate is null;
  if not found then raise exception 'date de naissance déjà enregistrée'; end if;
end;
$$;
revoke all on function public.set_birthdate(date) from public, anon;
grant execute on function public.set_birthdate(date) to authenticated;

-- A5. Notifications push : il faut un LIEN avec la cible. Avant, tout compte lisait les clés
--     push de n'importe qui (push_targets) et pouvait supprimer son abonnement (push_prune).
--     Liens admis : conversation acceptée en commun, amis mutuels, lien de gardien,
--     réservation ↔ gestionnaire du lieu. Une demande de message en attente ne pousse rien.
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
        where (g.user_id = auth.uid() and g.guardian_id = target)
           or (g.user_id = target and g.guardian_id = auth.uid())
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

create or replace function public.push_targets(target uuid)
returns table(endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.user_id = target
    and private.can_push(target);
$$;

create or replace function public.push_prune(dead_endpoint text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_subscriptions s
  where s.endpoint = dead_endpoint
    and (s.user_id = auth.uid() or private.can_push(s.user_id));
$$;

-- A6. is_adult(uid) répondait pour n'importe quel compte. Les deux policies qui l'appellent ne
--     concernent que soi ; dating_candidates et dating_like (definer) gardent l'accès direct.
create or replace function private.i_am_adult()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_adult(auth.uid());
$$;
revoke all on function private.i_am_adult() from public, anon;
grant execute on function private.i_am_adult() to authenticated;

alter policy dating_profiles_upsert on public.dating_profiles
  with check (user_id = auth.uid() and private.i_am_adult());
alter policy dating_profiles_update on public.dating_profiles
  with check (user_id = auth.uid() and (enabled = false or private.i_am_adult()));

-- A7. Groupe : on n'y met ni quelqu'un qui nous a bloqué (ou qu'on a bloqué), ni cent personnes.
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
    values (true, nullif(trim(coalesce(group_title,'')), ''), me, 'accepted')
    returning id into cid;
  insert into public.conversation_members (conversation_id, user_id) values (cid, me) on conflict do nothing;
  foreach m in array coalesce(members, '{}'::uuid[]) loop
    if m <> me
       and exists (select 1 from public.profiles where id = m)
       and not public.blocked_between(me, m) then
      insert into public.conversation_members (conversation_id, user_id) values (cid, m) on conflict do nothing;
    end if;
  end loop;
  return cid;
end;
$$;

notify pgrst, 'reload schema';
