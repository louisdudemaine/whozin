-- Lot 2 — partie F : en mode éphémère « dès la lecture », un snap pas encore ouvert n'expire plus
-- à la simple ouverture du fil.
-- Avant : mark_conversation_read posait expires_at = now() + 10 s sur TOUS les messages reçus encore
-- sans échéance, snaps non ouverts compris. Ouvrir le fil (ou y recevoir un message) suffisait à perdre
-- le snap avant de l'avoir vu : purge_ephemeral supprimait la ligne et, depuis E, purge-chat retire le
-- fichier. Sur mobile, qui ne sait pas ouvrir un snap (« ouvre sur le web »), c'était systématique.
-- Après : les snaps sont exclus ; leur échéance reste celle d'open_snap (8 s après l'ouverture).
-- Seul changement par rapport à 20261111200000_lot2_c_additif.sql : `and not view_once`
-- (view_once est NOT NULL, défaut false). create or replace garde les droits.

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
        and created_at >= v_since
        and not view_once;  -- un snap expire à son ouverture (open_snap : 8 s), pas à la lecture du fil
  end if;
end;
$$;

-- RETOUR ARRIÈRE : reprendre la définition de 20261111200000_lot2_c_additif.sql (lignes 1267-1285).
