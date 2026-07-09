-- 01-DATA-MODEL.md defines user_profiles but doesn't specify how rows get
-- created on signup. Auto-create one (default role 'submitter') so every
-- Supabase Auth user has a profile row without a manual insert step.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'submitter');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
