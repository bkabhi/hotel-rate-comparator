# Hotel Rate Comparator

A hotel search across Indian cities that calls two supplier APIs in parallel and returns the
cheapest rate in rupees, with the fan-out orchestrated by a **Temporal** workflow so that slow,
flaky and failing suppliers are handled deliberately rather than accidentally.

```
frontend/   React + TypeScript operator console (Vite)
backend/    Express API · Temporal worker + workflow · mock supplier APIs
```

---

## Quick start

**Prerequisites:** Node.js ≥ 18. Nothing else — the setup script fetches the Temporal CLI,
which bundles a self-contained dev server (no Docker required).

```bash
npm run setup
```

Then, in **two terminals**:

```bash
npm run temporal
```

```bash
npm run dev
```

Open **http://localhost:5173**.

| Process | Port | What it is |
| --- | --- | --- |
| Frontend | 5173 | React operator console |
| REST API | 4000 | `/api/search-hotels` — starts, polls and cancels searches |
| Mock suppliers | 4001 | `/supplierA/hotels`, `/supplierB/hotels` |
| Temporal server | 7233 | gRPC — the workflow service |
| Temporal Web UI | 8233 | Every workflow execution, event by event |

`npm run temporal` is separate on purpose: the dev server holds workflow history in memory,
so restarting the app processes never loses a run in flight.

<details>
<summary>Running each process by hand</summary>

```bash
npm --prefix backend run temporal:dev     # Temporal server  :7233 (UI :8233)
npm --prefix backend run dev:suppliers    # Mock suppliers   :4001
npm --prefix backend run dev:worker       # Temporal worker
npm --prefix backend run dev:api          # REST API         :4000
npm --prefix frontend run dev             # Frontend         :5173
```

If `temporal` is already on your `PATH`, that is used in preference to the copy in
`backend/.bin/`.
</details>

---

## Tests

```bash
npm test               # everything — 56 tests
npm run test:workflow   # workflow scenarios, against Temporal's time-skipping test server
npm run test:unit       # comparator, activity, supplier APIs, request validation
```

Workflow tests run the **real workflow code** on Temporal's time-skipping test server with the
supplier activity mocked, so retry backoffs and the five-second supplier deadline resolve
without the wall-clock wait. No Temporal server needs to be running.

### Scenario coverage

Every row of the brief maps to a named test in
[`backend/tests/workflow/hotel-search.workflow.test.ts`](backend/tests/workflow/hotel-search.workflow.test.ts).

| Scenario | Expected | Test |
| --- | --- | --- |
| Supplier A cheaper | Return A's result | `returns Supplier A's result when A is cheaper` |
| Supplier B cheaper | Return B's result | `returns Supplier B's result when B is cheaper` |
| Both return the same rate | Deterministic — Supplier A | `breaks an exact tie deterministically in favour of Supplier A` |
| Supplier A fails, B succeeds | Return B's result | `returns Supplier B's result when Supplier A fails outright` |
| Both fail | Return an error | `fails the search when both suppliers fail` |
| One returns empty | Use the available result | `uses the available result when one supplier returns an empty list` |
| Both return empty | "No hotels found" | `reports "No hotels found" when both suppliers return empty lists` |
| One supplier takes > 5 s | Cancel it, proceed with one result | `cancels a supplier that exceeds the 5s deadline and proceeds with the other` |
| Supplier A fails 2× before success | Still succeeds, within the retry policy | `succeeds when Supplier A fails twice before succeeding…` |
| User cancels mid-way | Workflow stops gracefully | `stops gracefully when the caller cancels the search mid-way` |

Plus, beyond the brief: both suppliers timing out, a supplier exhausting its retry budget,
the live progress query, and the derived result shape.

---

## How the orchestration works

[`backend/src/temporal/workflows.ts`](backend/src/temporal/workflows.ts)

Both suppliers are called in parallel, each inside its **own cancellation scope with a
five-second budget**:

```ts
await CancellationScope.withTimeout(policy.supplierDeadlineMs, () =>
  call(supplier, request, searchKey),
);
```

That single construct covers three different failure modes, and keeps them distinguishable:

- **A supplier stalls.** Its budget expires, Temporal *cancels the activity* — the activity's
  cancellation signal is wired into `fetch`, so the in-flight HTTP request is genuinely torn
  down rather than left orphaned — and the search continues with whatever else answered.
  The supplier is reported as `TIMED_OUT`, not as a generic failure.
- **A supplier fails fast.** The activity throws a retryable error, so Temporal's retry policy
  (3 attempts, 200 ms initial backoff, doubling) handles it. Because retries share the same
  five-second budget, "fails twice then succeeds" recovers while "stalls forever" does not.
- **The user cancels.** The cancellation reaches the *root* scope rather than a supplier's
  child scope. The workflow tracks that separately, so it can tell "this supplier ran out of
  time" apart from "the whole search was called off", and ends as `CancelledFailure` instead
  of inventing a result.

Each supplier runner resolves to an outcome instead of rejecting, so one supplier's failure
can never short-circuit the other's work.

**Choosing the winner** ([`compare.ts`](backend/src/temporal/compare.ts)) is a pure, total
ordering — price, then supplier priority (A before B), then `hotelId`. The tie-break is a real
comparator rule rather than a race, so the same set of responses always produces the same
winner on workflow replay.

**Outcomes are distinguished, not flattened:**

| Situation | Result |
| --- | --- |
| At least one supplier returned hotels | `SearchResult { status: 'BEST_RATE', best, offers, suppliers }` |
| Both answered, neither had inventory | `SearchResult { status: 'NO_HOTELS', message: 'No hotels found' }` |
| Neither supplier answered at all | Workflow fails with `ApplicationFailure` typed `ALL_SUPPLIERS_FAILED`, carrying each supplier's outcome in its details |

An empty hotel list is a valid answer, not an error — that is what lets "one supplier returns
empty" still produce a best rate.

---

## API

```http
POST /api/search-hotels          → 202 { searchId, runId, status, startedAt }
GET  /api/search-hotels/:id      → 200 { status, progress?, result?, error? }
POST /api/search-hotels/:id/cancel → 202
GET  /api/health                 → Temporal connectivity
GET  /api/cities                 → cities the mock suppliers cover
```

The frontend **starts and then polls**, rather than blocking on one request. That is what
makes live per-supplier state and a working cancel button possible — a single blocking call
can offer neither.

While a search runs, `GET /api/search-hotels/:id` reads the workflow's own
[`searchProgress` query](backend/src/temporal/shared.ts) and overlays the attempt counts
Temporal already tracks for pending activities, so a retry is visible *while it is happening*
rather than only in hindsight. Closed workflows are queried too, so a failed or cancelled run
still shows what each supplier did.

For scripting, `?wait=1` blocks until the workflow closes and returns the final result:

```bash
curl -s -X POST 'http://localhost:4000/api/search-hotels?wait=1' \
  -H 'content-type: application/json' \
  -d '{"city":"Mumbai","checkIn":"2026-05-01","checkOut":"2026-05-04"}'
```

---

## Mock suppliers

```http
GET /supplierA/hotels?city=&checkIn=&checkOut=[&behavior=][&key=]
GET /supplierB/hotels?city=&checkIn=&checkOut=[&behavior=][&key=]
```

Both return `{ supplier, city, nights, hotels: [{ hotelId, name, price, currency, rating,
neighbourhood }] }`. Prices are in **INR** for the whole stay and scale with the night count.

Inventory covers six Indian cities — **Mumbai, New Delhi, Jaipur, Goa, Udaipur** and **Kochi** —
across two fictional suppliers, **Sarai Travel** (A) and **Nivaas Rooms** (B). Their shelves
overlap but are priced differently, so which supplier wins depends on the city:

| City | Cheapest rate | Why it is here |
| --- | --- | --- |
| Mumbai | ₹4,300/night, Supplier **A** | A-only inventory undercuts everything B carries |
| Jaipur | ₹3,600/night, Supplier **B** | B beats A on the same hotel |
| Udaipur | ₹7,900/night, **exact tie** | Both suppliers quote the same rate — the tie-break decides |

Any city outside the catalogue returns an empty list, which is a convenient way to reach the
"no hotels found" path without touching the simulation controls.

`behavior` forces a code path:

| Value | Behaviour |
| --- | --- |
| `normal` | Answers in 120–520 ms |
| `slow:3000` | Answers after the given delay |
| `timeout` | Never answers — the workflow's deadline is what ends it |
| `empty` | Answers `200` with no hotels |
| `error:503` | Answers with the given status |
| `flaky:2` | Fails the first *n* calls for a given `key`, then succeeds |

`flaky` counts per `key` — the activity passes the workflow id — so retries within one search
share a counter while separate searches each start fresh.

`POST /__mock/config` sets server-wide defaults and `POST /__mock/reset` clears them, which is
how the integration tests drive the endpoints without threading a query parameter through.

---

## The frontend

A single operator console, built around the idea that the interesting part of this system is
the orchestration, so the orchestration is what the interface shows.

- **Live supplier lanes.** Each supplier reports queued → calling → retrying (with its attempt
  number) → returned / empty / failed / timed out / cancelled, with round-trip latency.
- **A simulation panel.** Force either supplier to stall, error, return nothing, or fail twice
  and recover, then watch the workflow absorb it. Every scenario in the brief is reachable by
  clicking, not just by reading test output.
- **Distinct terminal states.** A best rate, "no hotels found", a supplier-failure error and a
  user cancellation each look different and say something different, because they mean
  different things.
- **A cancel button** that actually cancels the workflow, which stands both suppliers down.

Built with React 18, TypeScript and CSS Modules — no UI framework. Fonts are self-hosted
(Inter, JetBrains Mono for figures); icons are [Lucide](https://lucide.dev). The API is proxied
through Vite, so the frontend needs no base-URL configuration.

---

## Configuration

Copy `backend/.env.example` to `backend/.env` to change anything. All values have working
defaults, so this is optional.

| Variable | Default | Effect |
| --- | --- | --- |
| `SUPPLIER_DEADLINE_MS` | `5000` | Total budget per supplier, retries included. Exceeding it cancels that supplier. |
| `SUPPLIER_ATTEMPT_TIMEOUT_MS` | `5000` | Per-attempt activity timeout. |
| `SUPPLIER_MAX_ATTEMPTS` | `3` | Attempts per supplier. `1` disables retries. |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server. |
| `TEMPORAL_TASK_QUEUE` | `hotel-search` | Task queue the worker polls. |
| `API_PORT` / `SUPPLIER_PORT` | `4000` / `4001` | Listen ports. |

---

## Assumptions

- **Prices are totals for the stay, in INR**, quoted by both suppliers in the same currency.
  Real suppliers often quote in their own currency, which would need an FX activity before the
  comparison is meaningful; that is deliberately out of scope. Figures are formatted with the
  `en-IN` locale, so they use the rupee sign and lakh-style grouping (₹1,23,456).
- **"Cheapest" means lowest total price**, ignoring cancellation terms, board type and taxes.
  A real comparator weighs those, which changes the shape of the comparator but not the
  orchestration around it.
- **A tie goes to Supplier A.** The brief asks only for determinism; supplier priority is the
  simplest rule that provides it and is easy to replace with a real preference order.
- **An empty response is a valid answer, not a failure.** This is what makes "one supplier
  returns empty" produce a result rather than an error.
- **Check-in is not validated against today** on the server. The form prevents past dates, but
  the API accepts them so tests are not tied to the calendar. Stays are capped at 30 nights.
- **Supplier inventory is a fixed catalogue** of six Indian cities with hand-set nightly rates
  in a realistic band (about ₹3,000 for a guesthouse room up to ₹26,000 for a heritage suite).
  Any other city returns an empty list — a convenient way to reach the "no hotels found" path
  with no simulation. Hotel and supplier names are invented; they are not real businesses.

## Known limitations

- **The Temporal dev server keeps history in memory.** Restarting it discards past runs, and a
  search whose workflow has been evicted returns `404 SEARCH_NOT_FOUND`. Production would use
  a persistent Temporal cluster.
- **The API contract is duplicated**, not shared: `frontend/src/api/contract.ts` mirrors
  `backend/src/shared/types.ts`. This keeps the two apps independently installable and
  deployable at the cost of one file that must be kept in step. At a larger size this should
  become a shared workspace package or a generated client.
- **The frontend polls at 350 ms.** Fine for a single operator; a production build would use
  SSE or a WebSocket rather than a poll per client.
- **There are no browser end-to-end tests.** The scenario matrix is covered at the workflow
  level, where the logic actually lives; the UI was verified by hand across desktop and mobile.
- **The mock suppliers hold `flaky` counters in memory**, so they reset with the process and
  are not safe across multiple supplier instances. They are a test fixture, not a service.
- **Cancellation is best-effort at the edge.** The workflow and both activities stop promptly,
  but a supplier that has already begun writing a response will finish writing it to a socket
  nobody is reading.
# hotel-rate-comparator
