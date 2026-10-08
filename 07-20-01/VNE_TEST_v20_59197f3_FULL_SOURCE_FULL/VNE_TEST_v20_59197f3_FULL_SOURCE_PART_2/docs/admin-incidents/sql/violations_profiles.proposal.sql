-- ACCESS-PROFILE DDL PROPOSAL ONLY. NO REAL EXECUTION OR STAFF ASSIGNMENT AUTHORIZED.
-- Adds three narrowly scoped enum labels and preserves existing role constraints.
-- Worker requires an event and finite expiry. Manager may be explicitly global. Intake reviewer is a separate global profile.
begin;
set local search_path='';
set local lock_timeout='3s';
do $preflight$
begin
 if current_user<>'postgres' then raise exception 'incident_profile_owner_mismatch'; end if;
 if (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid='public.staff_role'::regtype)
    is distinct from array['owner','admin','editor','moderator','scanner','shift_lead','finance'] then
    raise exception 'incident_profile_enum_drift';
 end if;
 if (select replace(pg_get_constraintdef(oid),'public.','') from pg_constraint
     where conrelid='public.staff_assignments'::regclass and conname='event_scoped_roles')
    is distinct from $expected$CHECK ((((role = ANY (ARRAY['moderator'::staff_role, 'scanner'::staff_role, 'shift_lead'::staff_role])) AND (event_id IS NOT NULL)) OR ((role = ANY (ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role, 'finance'::staff_role])) AND (event_id IS NULL))))$expected$ then
    raise exception 'incident_profile_scope_drift';
 end if;
 if (select replace(pg_get_constraintdef(oid),'public.','') from pg_constraint where conrelid='public.staff_assignments'::regclass and conname='event_role_scope_and_expiry') is distinct from $expiry$CHECK (((role <> ALL (ARRAY['moderator'::staff_role, 'scanner'::staff_role, 'shift_lead'::staff_role])) OR ((event_id IS NOT NULL) AND (valid_until IS NOT NULL))))$expiry$ then
    raise exception 'incident_profile_expiry_constraint_drift';
 end if;
end $preflight$;
alter type public.staff_role add value 'incident_operator';
alter type public.staff_role add value 'incident_manager';
alter type public.staff_role add value 'membership_reviewer';
alter table public.staff_assignments drop constraint event_scoped_roles;
alter table public.staff_assignments add constraint event_scoped_roles check(
 (role::text in ('moderator','scanner','shift_lead','incident_operator') and event_id is not null)
 or role::text='incident_manager'
 or (role::text in ('owner','admin','editor','finance','membership_reviewer') and event_id is null)
);
alter table public.staff_assignments drop constraint event_role_scope_and_expiry;
alter table public.staff_assignments add constraint event_role_scope_and_expiry check(
 (role::text not in ('moderator','scanner','shift_lead','incident_operator') and not (role::text='incident_manager' and event_id is not null))
 or (event_id is not null and valid_until is not null)
);
-- No INSERT into staff_assignments or member_admission. No GRANT or Auth mutation.
commit;
