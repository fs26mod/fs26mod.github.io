-- Supabase > SQL Editor'de bir kez çalıştır (puan, kaydetme, profil, haftanın seçimi)
alter table mods add column if not exists owner_name text;
alter table mods add column if not exists featured boolean not null default false;
update mods set owner_name = split_part(u.email,'@',1)
  from auth.users u where u.id = mods.owner_id and mods.owner_name is null;

create table if not exists ratings (
  mod_id text not null,
  user_id uuid not null default auth.uid(),
  stars int not null check (stars between 1 and 5),
  primary key (mod_id, user_id)
);
alter table ratings enable row level security;
create policy "puan okuma" on ratings for select using (true);
create policy "puan ekleme" on ratings for insert with check (auth.uid() = user_id);
create policy "puan guncelleme" on ratings for update using (auth.uid() = user_id);

create table if not exists saved_mods (
  mod_id text not null,
  user_id uuid not null default auth.uid(),
  primary key (mod_id, user_id)
);
alter table saved_mods enable row level security;
create policy "kayit okuma" on saved_mods for select using (auth.uid() = user_id);
create policy "kayit ekleme" on saved_mods for insert with check (auth.uid() = user_id);
create policy "kayit silme" on saved_mods for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
