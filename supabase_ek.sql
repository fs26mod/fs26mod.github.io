-- Supabase > SQL Editor'de bir kez çalıştır
create table if not exists comments (id bigint generated always as identity primary key, mod_id text not null, user_id uuid references auth.users, username text, body text not null check (char_length(body) between 1 and 500), created_at timestamptz default now());
create table if not exists reports (id bigint generated always as identity primary key, mod_id text not null, user_id uuid, reason text, note text, created_at timestamptz default now());
create table if not exists mod_requests (id bigint generated always as identity primary key, user_id uuid references auth.users, username text, body text not null check (char_length(body) between 1 and 200), created_at timestamptz default now());
alter table comments enable row level security; alter table reports enable row level security; alter table mod_requests enable row level security;
create policy "yorum oku" on comments for select using (true);
create policy "yorum yaz" on comments for insert with check (auth.uid() = user_id);
create policy "yorum sil" on comments for delete using (auth.uid() = user_id or (auth.jwt()->>'email') = 'yusufmencuk2@gmail.com');
create policy "bildir yaz" on reports for insert with check (true);
create policy "bildir oku" on reports for select using ((auth.jwt()->>'email') = 'yusufmencuk2@gmail.com');
create policy "istek oku" on mod_requests for select using (true);
create policy "istek yaz" on mod_requests for insert with check (auth.uid() = user_id);
create policy "istek sil" on mod_requests for delete using (auth.uid() = user_id or (auth.jwt()->>'email') = 'yusufmencuk2@gmail.com');
