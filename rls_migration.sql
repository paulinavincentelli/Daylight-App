-- Enable RLS on all six public tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- users: only the user themselves can read/write their own row
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (id = auth.uid());

-- sessions: only the owning user can access their sessions
CREATE POLICY "sessions_select_own" ON public.sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "sessions_insert_own" ON public.sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "sessions_delete_own" ON public.sessions
  FOR DELETE USING (user_id = auth.uid());

-- user_sync: only the owning user
CREATE POLICY "user_sync_select_own" ON public.user_sync
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_sync_insert_own" ON public.user_sync
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_sync_update_own" ON public.user_sync
  FOR UPDATE USING (user_id = auth.uid());

-- tasks: only the owning user
CREATE POLICY "tasks_select_own" ON public.tasks
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tasks_insert_own" ON public.tasks
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "tasks_update_own" ON public.tasks
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "tasks_delete_own" ON public.tasks
  FOR DELETE USING (user_id = auth.uid());

-- push_subscriptions: only the owning user
CREATE POLICY "push_subscriptions_select_own" ON public.push_subscriptions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "push_subscriptions_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subscriptions_update_own" ON public.push_subscriptions
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "push_subscriptions_delete_own" ON public.push_subscriptions
  FOR DELETE USING (user_id = auth.uid());

-- app_settings: global read-only config for all authenticated users
CREATE POLICY "app_settings_select_authenticated" ON public.app_settings
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "app_settings_update_service" ON public.app_settings
  FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "app_settings_insert_service" ON public.app_settings
  FOR INSERT WITH CHECK (auth.role() = 'service_role');