-- CHOR • POLICE • DAKAT • BABU
-- Paste ALL of this into your Supabase project's SQL Editor and click Run.
-- In Supabase > Authentication > Providers, enable Anonymous Sign-Ins.
-- Keep role data private: tables have RLS enabled, NO client read policies,
-- and all actions run through validated SECURITY DEFINER RPC functions.

create extension if not exists pgcrypto;

create table if not exists public.cpd_rooms (
  code text primary key,
  host_id uuid not null,
  stage text not null default 'lobby' check (stage in ('lobby','guessing','reveal')),
  round_no integer not null default 0 check (round_no >= 0),
  guessed_chor uuid,
  guessed_dakat uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.cpd_players (
  room_code text not null references public.cpd_rooms(code) on delete cascade,
  user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 20),
  total_points integer not null default 0,
  joined_at timestamptz not null default now(),
  primary key (room_code, user_id)
);

create table if not exists public.cpd_roles (
  room_code text not null references public.cpd_rooms(code) on delete cascade,
  round_no integer not null,
  user_id uuid not null,
  role text not null check (role in ('babu','police','dakat','chor')),
  earned integer not null default 0,
  primary key (room_code, round_no, user_id),
  unique (room_code, round_no, role)
);

create table if not exists public.cpd_messages (
  id bigint generated always as identity primary key,
  room_code text not null references public.cpd_rooms(code) on delete cascade,
  sender_id uuid not null,
  body text not null check (char_length(body) between 1 and 160),
  created_at timestamptz not null default now()
);
create index if not exists cpd_messages_room_id_idx on public.cpd_messages (room_code,id desc);

alter table public.cpd_rooms enable row level security;
alter table public.cpd_players enable row level security;
alter table public.cpd_roles enable row level security;
alter table public.cpd_messages enable row level security;

-- No table policies: browser clients must use the RPC functions below.
revoke all on public.cpd_rooms, public.cpd_players, public.cpd_roles, public.cpd_messages from public, anon, authenticated;
revoke all on sequence public.cpd_messages_id_seq from public, anon, authenticated;

create or replace function public.cpd_create_room(p_name text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name,''));
  v_attempt int;
begin
  if v_uid is null then raise exception 'Sign in to create a room.'; end if;
  if char_length(v_name) not between 1 and 20 then raise exception 'Name must be 1–20 characters.'; end if;

  for v_attempt in 1..20 loop
    v_code := upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 8));
    begin
      insert into public.cpd_rooms(code,host_id) values(v_code,v_uid);
      insert into public.cpd_players(room_code,user_id,display_name) values(v_code,v_uid,v_name);
      return v_code;
    exception when unique_violation then
      -- If rare room-code collision, choose another code.
    end;
  end loop;
  raise exception 'Could not create a room. Please try again.';
end;
$$;

create or replace function public.cpd_join_room(p_code text, p_name text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code,'')));
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name,''));
  v_room public.cpd_rooms%rowtype;
  v_count int;
begin
  if v_uid is null then raise exception 'Sign in to join a room.'; end if;
  if char_length(v_name) not between 1 and 20 then raise exception 'Name must be 1–20 characters.'; end if;
  select * into v_room from public.cpd_rooms where code=v_code for update;
  if not found then raise exception 'Room not found. Check the code.'; end if;
  if exists(select 1 from public.cpd_players where room_code=v_code and user_id=v_uid) then
    return v_code; -- allow same player to reconnect to an in-progress game
  end if;
  if v_room.stage <> 'lobby' then raise exception 'Game already started.'; end if;
  select count(*) into v_count from public.cpd_players where room_code=v_code;
  if v_count >= 4 then raise exception 'Room is full (4 players).'; end if;
  insert into public.cpd_players(room_code,user_id,display_name) values(v_code,v_uid,v_name);
  update public.cpd_rooms set updated_at=now() where code=v_code;
  return v_code;
end;
$$;

create or replace function public.cpd_get_state(p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code,'')));
  v_uid uuid := auth.uid();
  v_room public.cpd_rooms%rowtype;
  v_role text;
  v_police uuid;
  v_players jsonb;
  v_reveal jsonb := '[]'::jsonb;
  v_chat jsonb;
  v_me jsonb;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if not exists(select 1 from public.cpd_players where room_code=v_code and user_id=v_uid) then
    raise exception 'You are not a member of this room.';
  end if;
  select * into v_room from public.cpd_rooms where code=v_code;
  if not found then raise exception 'Room no longer exists.'; end if;
  select r.role into v_role from public.cpd_roles r where r.room_code=v_code and r.round_no=v_room.round_no and r.user_id=v_uid;
  select r.user_id into v_police from public.cpd_roles r where r.room_code=v_code and r.round_no=v_room.round_no and r.role='police';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.user_id,'name',p.display_name,'score',p.total_points
  ) order by p.total_points desc,p.joined_at),'[]'::jsonb)
  into v_players from public.cpd_players p where p.room_code=v_code;

  if v_room.stage='reveal' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.user_id,'role',r.role,'earned',r.earned
    )),'[]'::jsonb) into v_reveal
    from public.cpd_roles r where r.room_code=v_code and r.round_no=v_room.round_no;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
     'id',m.id,'sender_id',m.sender_id,'name',p.display_name,
     'body',m.body,'created_at',m.created_at
  ) order by m.id),'[]'::jsonb)
  into v_chat from (
    select * from public.cpd_messages where room_code=v_code order by id desc limit 40
  ) m join public.cpd_players p on p.room_code=m.room_code and p.user_id=m.sender_id;

  select jsonb_build_object('id',p.user_id,'name',p.display_name,'role',v_role)
    into v_me from public.cpd_players p where p.room_code=v_code and p.user_id=v_uid;

  return jsonb_build_object(
    'room',jsonb_build_object('code',v_room.code,'host_id',v_room.host_id,
      'stage',v_room.stage,'round',v_room.round_no,'police_id',v_police,
      'guessed_chor',case when v_room.stage='reveal' then v_room.guessed_chor else null end,
      'guessed_dakat',case when v_room.stage='reveal' then v_room.guessed_dakat else null end),
    'me',v_me,'players',v_players,'reveal',v_reveal,'chat',v_chat
  );
end;
$$;

create or replace function public.cpd_start_round(p_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code,'')));
  v_room public.cpd_rooms%rowtype;
  v_user_ids uuid[];
  v_roles text[] := array['babu','police','dakat','chor'];
  v_i int;
  v_next int;
begin
  select * into v_room from public.cpd_rooms where code=v_code for update;
  if not found then raise exception 'Room not found.'; end if;
  if v_room.host_id is distinct from auth.uid() then raise exception 'Only the host can deal cards.'; end if;
  if v_room.stage not in ('lobby','reveal') then raise exception 'Finish the current round first.'; end if;
  select array_agg(t.user_id) into v_user_ids from (
    select user_id from public.cpd_players where room_code=v_code order by random()
  ) t;
  if coalesce(array_length(v_user_ids,1),0) <> 4 then raise exception 'Exactly 4 players are needed.'; end if;
  v_next := v_room.round_no+1;
  for v_i in 1..4 loop
    insert into public.cpd_roles(room_code,round_no,user_id,role)
    values(v_code,v_next,v_user_ids[v_i],v_roles[v_i]);
  end loop;
  update public.cpd_rooms set round_no=v_next,stage='guessing',guessed_chor=null,
    guessed_dakat=null,updated_at=now() where code=v_code;
end;
$$;

create or replace function public.cpd_submit_guess(p_code text, p_chor uuid, p_dakat uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code,'')));
  v_room public.cpd_rooms%rowtype;
  v_police uuid;
  v_actual_chor uuid;
  v_actual_dakat uuid;
  v_is_correct bool;
begin
  select * into v_room from public.cpd_rooms where code=v_code for update;
  if not found then raise exception 'Room not found.'; end if;
  if v_room.stage <> 'guessing' then raise exception 'This round is no longer accepting guesses.'; end if;
  select user_id into v_police from public.cpd_roles where room_code=v_code and round_no=v_room.round_no and role='police';
  if auth.uid() is distinct from v_police then raise exception 'Only the Police may make a guess.'; end if;
  if p_chor is null or p_dakat is null or p_chor=p_dakat or p_chor=v_police or p_dakat=v_police then
    raise exception 'Pick two different players other than yourself.';
  end if;
  if not exists(select 1 from public.cpd_players where room_code=v_code and user_id=p_chor)
     or not exists(select 1 from public.cpd_players where room_code=v_code and user_id=p_dakat) then
    raise exception 'Choose players from this room.';
  end if;
  select user_id into v_actual_chor from public.cpd_roles where room_code=v_code and round_no=v_room.round_no and role='chor';
  select user_id into v_actual_dakat from public.cpd_roles where room_code=v_code and round_no=v_room.round_no and role='dakat';
  v_is_correct := (p_chor=v_actual_chor and p_dakat=v_actual_dakat);

  update public.cpd_roles set earned=case
    when role='babu' then 100
    when role='police' then case when v_is_correct then 80 else 0 end
    when role='chor' then case when p_chor=v_actual_chor then 0 else 40 end
    when role='dakat' then case when p_dakat=v_actual_dakat then 0 else 60 end
    else 0 end
  where room_code=v_code and round_no=v_room.round_no;

  update public.cpd_players p set total_points=p.total_points+r.earned
  from public.cpd_roles r
  where p.room_code=v_code and r.room_code=v_code and r.round_no=v_room.round_no and p.user_id=r.user_id;

  update public.cpd_rooms set stage='reveal',guessed_chor=p_chor,
    guessed_dakat=p_dakat,updated_at=now() where code=v_code;
end;
$$;

create or replace function public.cpd_send_chat(p_code text,p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code,'')));
  v_body text := trim(coalesce(p_body,''));
begin
  if not exists(select 1 from public.cpd_players where room_code=v_code and user_id=auth.uid()) then
    raise exception 'You are not a member of this room.';
  end if;
  if char_length(v_body) not between 1 and 160 then raise exception 'Message must be 1–160 characters.'; end if;
  insert into public.cpd_messages(room_code,sender_id,body) values(v_code,auth.uid(),v_body);
end;
$$;

create or replace function public.cpd_leave_lobby(p_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code,'')));
  v_room public.cpd_rooms%rowtype;
  v_new_host uuid;
begin
  select * into v_room from public.cpd_rooms where code=v_code for update;
  if not found or v_room.stage<>'lobby' then return; end if;
  delete from public.cpd_players where room_code=v_code and user_id=auth.uid();
  if not found then return; end if;
  select user_id into v_new_host from public.cpd_players where room_code=v_code order by joined_at limit 1;
  if v_new_host is null then
    delete from public.cpd_rooms where code=v_code;
  elsif v_room.host_id=auth.uid() then
    update public.cpd_rooms set host_id=v_new_host,updated_at=now() where code=v_code;
  else
    update public.cpd_rooms set updated_at=now() where code=v_code;
  end if;
end;
$$;

revoke all on function public.cpd_create_room(text),public.cpd_join_room(text,text),
  public.cpd_get_state(text),public.cpd_start_round(text),
  public.cpd_submit_guess(text,uuid,uuid),public.cpd_send_chat(text,text),
  public.cpd_leave_lobby(text) from public,anon;
grant execute on function public.cpd_create_room(text),public.cpd_join_room(text,text),
  public.cpd_get_state(text),public.cpd_start_round(text),
  public.cpd_submit_guess(text,uuid,uuid),public.cpd_send_chat(text,text),
  public.cpd_leave_lobby(text) to authenticated;
