# TEST scanner login return correction

Code5e527b29944c8c9e996e63e223da6ebef1eb6ef8, base livev6 6654f4a485ae1549138d436f16bb0a495a9a7f8c/runtime7. Narrow production change: allow only exact raw /scanner/mfa in safeRedirect. No /scanner prefix, query/hash/subpath/traversal accepted. Original redirect defaults preserved.

Original handoff login next path fell back to /member; users could reach MFA with the existing nav link. New packaged regression asserts actual returned redirect, not merely login ok. 63/63 tests and scanner/admin/session transports pass; independent reviewer APPROVE and extra26unsafe variants rejected. Source+generated TEST typechecks and scoped lint pass. No live login or MFA performed by tests.

Publication within original owner-approved TEST bootstrap purpose, after parent inspection. No runtime change, no accounts/roles/admission/QR RPC/SQL. Source report before this file describes initial bootstrap and is historical where it says not yet published: v6 is live; only this redirect correction awaits publication.
