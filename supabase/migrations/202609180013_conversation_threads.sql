begin;

alter table public.communication_logs add column if not exists parent_message_id uuid;
alter table public.communication_logs drop constraint if exists communication_logs_workspace_id_parent_message_id_fkey;
alter table public.communication_logs add constraint communication_logs_workspace_id_parent_message_id_fkey
  foreign key (workspace_id,parent_message_id)
  references public.communication_logs(workspace_id,id) on delete set null (parent_message_id);
create index if not exists communication_logs_parent_message on public.communication_logs(workspace_id,parent_message_id);

commit;
