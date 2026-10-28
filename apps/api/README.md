# Liftory API

POST `/api/sync` accepts JSON bodies up to **1 MiB**. This accommodates the shared
contract maximum of 50 exercises with 50 sets each while keeping the request bounded.
Larger bodies return HTTP 413 with `{ "code": "payload_too_large" }`.

Contract validation returns HTTP 400 with `code: "validation_failed"` and
`fields: [{ path, message }]`. Field paths use dots and array indexes, for example
`entity.data.exercises.0.sets.0.reps`. Responses contain at most 50 field errors,
paths up to 200 characters and messages up to 300 characters. Submitted values and
unknown property names are not echoed.

Run PostgreSQL integration tests with `TEST_DATABASE_URL` set to an isolated test
database. Without it, integration suites are explicitly skipped. Unit tests still run.
