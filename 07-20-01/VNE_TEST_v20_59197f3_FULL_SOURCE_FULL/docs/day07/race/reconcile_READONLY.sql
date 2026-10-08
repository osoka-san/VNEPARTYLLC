-- READ ONLY. Exact two approved operation IDs via transaction-local GUCs. No token/digest/query fields.
with desired(actor,operation_id) as(values
 ('1e7259c2-ad13-43a1-b34b-cba71533e844'::uuid,current_setting('vne.day07.op_a')::uuid),
 ('ed2433cb-bc6e-4b23-aa57-000839292ec4'::uuid,current_setting('vne.day07.op_b')::uuid))
select clock_timestamp() observed_at,
 (select jsonb_agg(jsonb_build_object('actor',r.actor,'operationId',r.operation_id,'receipt',r.receipt,'backendPid',r.backend_pid,'statementStartedAt',r.statement_started_at,'createdAt',r.created_at) order by r.actor) from private.qr_command_receipts r join desired d using(actor,operation_id)) receipts,
 (select count(*) from private.ticket_checkins where participation_id='d0700000-0000-4000-8000-000000000006') primary_count,
 (select count(*) from private.qr_command_receipts r join desired d using(actor,operation_id) where receipt->>'outcome'='simulated_accepted') accepted_count,
 (select count(*) from private.qr_command_receipts r join desired d using(actor,operation_id) where receipt->>'outcome'='used') used_count,
 (select count(*) from private.ticket_events e join desired d on d.actor=e.actor and d.operation_id=e.operation_id where e.action='qr.v2.checkin' and e.event_id='d0700000-0000-4000-8000-000000000001') event_audit_count,
 (select count(*) from private.audit_log l join desired d on d.actor=l.actor and d.operation_id=(l.details->>'operationId')::uuid where l.action='qr.v2.checkin' and l.object_id='d0700000-0000-4000-8000-000000000006') security_audit_count;
