-- Supabase > SQL Editor'de bir kez çalıştır
alter table mods add column if not exists brand text;
alter table mods add column if not exists downloads integer not null default 0;

create or replace function inc_download(mod_id text)
returns void language sql security definer as $$
  update mods set downloads = downloads + 1 where id::text = mod_id;
$$;
grant execute on function inc_download(text) to anon, authenticated;
