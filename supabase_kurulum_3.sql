create table if not exists site_users (
  user_id uuid primary key default auth.uid(),
  username text not null check (char_length(username) between 3 and 20)
);
create unique index if not exists site_users_username_ci on site_users (lower(username));
alter table site_users enable row level security;
create policy "isim okuma" on site_users for select using (true);
create policy "isim ekleme" on site_users for insert with check (auth.uid() = user_id);
create policy "isim guncelleme" on site_users for update using (auth.uid() = user_id);

update mods set owner_name = null;

notify pgrst, 'reload schema';
