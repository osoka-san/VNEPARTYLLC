# Chosen local storage proposal and access boundary

The owner approved account-owned general intake with status in the cabinet and
separate event admission. The local implementation chooses the existing
membership_requests row as the sole request entity, avoiding a new table/lifecycle.
This document is not permission to apply either SQL file.

## Closed schema proposal

File: membership_questionnaire_proposal.sql

Four nullable fields are added for legacy compatibility:
- owner_user_id UUID references auth.users(id), delete restricted
- questionnaire_snapshot JSONB, including immutable version and all answers
- idempotency_key UUID
- correlation_id UUID

The fields are either all absent on a legacy row or all present on an owned row.
Legacy rows are never backfilled or claimed by matching contact information.
Original intake, consent, snapshot and ownership/operation metadata are immutable.
Moderation status can change separately without mutating the submitted record.
Owned rows cannot acquire legacy invite fields; old approval/invitation paths
roll back atomically rather than accidentally creating account invitations.

## Exact index change (not purely additive)

Previous unique index:
CREATE UNIQUE INDEX membership_requests_pending_email_uq
ON public.membership_requests USING btree (lower(email))
WHERE status = 'pending'::public.membership_request_status;

Proposed replacement keeps that name and legacy semantics but adds:
AND owner_user_id IS NULL

New owned requests use a unique pending-owner index instead. Another unique index
covers (owner_user_id, idempotency_key) for owned rows. The proposal checks expected
prior index structure and duplicate preconditions before replacing anything.
It runs atomically with a bounded lock timeout; drift or failure rolls it back.

Why: typed contact email is unverified intake information, not account identity.
A user must not reserve another account's contact email or claim an older request
by matching it. Different owners may therefore submit the same contact email
without revealing, linking or overwriting one another's records. Verified email
before event admission is a separate future gate; this change does not move it.

One pending request per owner prevents accidental duplicate intake. A different
operation key while an owned request is pending conflicts, without overwriting it.
An identical owner/key/full normalized body replays the original request and
correlation, including its current review status. Altered body with that key
conflicts. No event is required; event_slug is optional declared interest only.

## Narrow private operations

private.membership_questionnaire_submit(_command jsonb)
private.membership_questionnaire_read_own(_request uuid)
private.membership_questionnaire_list_own()

Private functions derive ownership from auth.uid() and require a matching live
nonanonymous authenticated session. They do not require staff, MFA, admission or
verified email merely for this intake. Full canonical questionnaire structure is
revalidated in SQL. Audit contains only request metadata, never personal answers,
age, email or Telegram text. No delivery/outbox/invite action is performed.

The closed proposal revokes all new function access from PUBLIC, anon,
authenticated and service_role. Table/private-schema grants stay closed.

## Separate access proposal

File: membership_questionnaire_activation_proposal.sql

The application targets these exact proposed public wrappers:
- public.vne_submit_membership_questionnaire(_command jsonb)
- public.vne_read_my_membership_questionnaires(_request uuid DEFAULT NULL)

Read always returns a projected receipt array: the specified owned request or
an empty array, or at most 50 owned receipts when _request is NULL. No answers,
contact fields, staff notes, tokens or other owners' data are returned by this
status route. The server additionally validates ownership and allowlists fields.

Wrappers use a checked trusted owner, SECURITY DEFINER, empty search_path, an
explicit authenticated identity check and the private live-session checks.
Within the same transaction all default grants are revoked, then EXECUTE is given
only to authenticated. No table or private-schema privileges are granted. Actual
role grants are an access expansion and require the separate exact approval.

## Application rollout remains separate

VNE_MEMBERSHIP_QUESTIONNAIRE must be exactly `test` and the existing allowed test
Supabase configuration must be valid. This flag defaults off, does not create
wrappers/grants, is not real-data consent and was not set on any deployed site.

The following remain separate gates: applying the closed schema; applying the
reviewed wrapper access; confirming supported Auth and real concurrent behavior;
reviewing actual browser preview; choosing age/consent/retention and permitted
reviewers; and enabling collection. No blanket backend activation is implied.
