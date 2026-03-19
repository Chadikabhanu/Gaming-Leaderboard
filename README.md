# Real-Time Gaming Leaderboard

A high-performance leaderboard system using Redis, WebSockets, and Lua scripting.

## Quick Start
```bash
docker-compose up --build
```

Open http://localhost:3000

## Services

| Service  | Port | Description |
|----------|------|-------------|
| Redis    | 6379 | Data store  |
| Producer | 5001 | Event generator |
| Consumer | 5002 | Stream processor |
| API      | 8000 | REST + WebSocket |
| Frontend | 3000 | React UI |

## Architecture

- **Producer** generates score events → **Redis Stream** (`score_events`)
- **Consumer** reads stream → executes **Lua script** → updates 3 sorted sets atomically
- **API** serves REST endpoints + forwards Pub/Sub messages over **WebSocket**
- **Frontend** fetches initial data via HTTP, receives live updates via WebSocket

## API Endpoints

- `GET /api/leaderboard/global?limit=50`
- `GET /api/leaderboard/country/{code}?limit=50`
- `GET /api/leaderboard/global/7-day?limit=50`
- `WS /ws/rank-updates`

## Sliding Window Analysis: ZUNIONSTORE vs Score Decay

### Approach 1: Daily Buckets + ZUNIONSTORE (implemented)

Each score event is written to a daily sorted set (`leaderboard:daily:YYYY-MM-DD`).
To serve the 7-day leaderboard, the API runs `ZUNIONSTORE` across 7 keys into a temp key, queries it, then deletes it.

### Approach 2: Score Decay

A single sorted set holds all scores. A background job runs periodically and multiplies every score by a decay factor (e.g. 0.9 per day), making older scores less valuable over time.

### Comparison

| Criterion | ZUNIONSTORE (daily buckets) | Score Decay |
|---|---|---|
| **Correctness** | Exact — only scores from last 7 days count | Approximation — decay is exponential, not a hard cutoff |
| **Write complexity** | O(log N) per event, writes to 3 keys | O(1) per event, writes to 1 key |
| **Read complexity** | O(N log N) for union across 7 sets | O(log N) direct read |
| **Memory usage** | 7× the daily data stored separately | 1× single set |
| **Scalability** | ZUNIONSTORE on 100M-user sets becomes slow; consider pre-computing every 5s | Decay job must iterate all users periodically — impossible at 100M+ users without pagination |

### Verdict

- At **small-to-medium scale** (< 1M users): ZUNIONSTORE is preferable — results are exact and the per-request cost is acceptable.
- At **large scale** (> 10M users): pre-compute the ZUNIONSTORE result on a background schedule (every 5–30 seconds) and serve from cache. This keeps reads O(log N) while maintaining correctness.
- Score decay is simpler to write but never gives an exact 7-day window, and the decay job itself becomes a scaling problem at high user counts.