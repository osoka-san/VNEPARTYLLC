# Day07 one-arm QA repair — 2026-10-08

This change repairs the TEST timing instrument. It does not activate QR, grant a role, seed a pass, change authentication, or establish real PostgreSQL concurrency.

## Operator contract

The operator selects a fixed UTC target 30–120 seconds ahead and explicitly plans one rehearsal. Inputs become immutable and a countdown appears. Near the target, the controller obtains fresh MFA status, performs exactly three existing clock probes, then sends one scheduled rehearsal. After externally reconciled evidence and a separately prepared synthetic pass, the same process plans one check-in with an immutable operation UUID. There is no retry, catch-up, automatic re-arm or shifted target.

The complete winner path is 4 rehearsal-stage POSTs, 5 check-in-stage POSTs and one explicitly confirmed replay, at most 10 POSTs. MFA reads do not consume the POST budget. Render/mount performs no network request. Existing role, identity, admission, database time-window, token and idempotency checks remain authoritative.

## Clock quality

For monotonic send a, receive b and parsed database timestamp s, the possible database-minus-monotonic offset is [s−b−1, s−a+1]. A sample has valid quality at RTT <=1500 ms. Of the fixed three samples, at least two must have valid quality and all valid intervals must intersect. An otherwise valid sample with 1500<RTT<4000 may be excluded from quality, but its wider interval must overlap the accepted intersection. Invalid identity, response shape or server time, clock discontinuity, timeout or contradictory intervals stop the stage.

The intersection midpoint drives calibrated time from the monotonic clock; its conservative half-width remains <=751 ms. The independent 25 ms wall/monotonic discontinuity check, 4-second response timeout, 15-second identity freshness, 30-second timed-dispatch calibration freshness, 100 ms lateness and 200 ms dispatch timer gap remain enforced. Preparation that cannot fit safely stops. No client-time calculation establishes a database permission or concurrency result.

## Lifecycle and replay

Hidden, offline, navigation, signout, unmount and explicit cancellation invalidate waiting and in-flight work. Stale responses cannot restore state or consume a new epoch's budget. Reset is explicit and possible only before any QR POST. After a dispatched mutation, an unknown result remains uncertain.

Following external database reconciliation, the winner's single replay reads fresh MFA and checks the same identity, visibility, network, immutable original command and remaining budget. It does not reuse stale client calibration or add probe POSTs. The public database wrapper checks its absolute window before and after execution; private actor/MFA/staff checks occur before cached receipt return. Cancellation before the actual replay POST preserves the original receipt as replay_blocked; after invocation it is uncertain. Repeated lifecycle notifications cannot change that boundary.

## Evidence limits

The preceding live run bca46655-1d3e-42eb-bc3e-863b04c54a01 produced four invalid-token clock probes, no pass, no primary entry and no operation receipt. Its observer reported NOT_VERIFIED_NO_OVERLAP. Access was closed early at 12:43:23 UTC: QR disabled, all API execute permissions revoked, 24 historical scanner assignments revoked, three admissions revoked and four events archived. History was retained.

The observed worker durations of 1093/618/555/407 ms are server durations, not full browser RTT. The original browser failure did not retain the metrics needed to distinguish excessive RTT from a clock discontinuity. This repair retains only safe per-sample measurements and reasons.

Local controller, React DOM, mathematical and single-connection PGlite checks do not prove genuine Auth integration, actual browser timing or two PostgreSQL connections. A future live run needs a freshly reviewed fixture manifest that preserves the four historical probe audits and 24 revoked assignments, a new bounded approval and current session readiness. The next window must not reuse an expired manifest.
