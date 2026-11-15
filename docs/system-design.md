# Reelmark Clipper — system design

Paste a YouTube link → a 10–20 s vertical (9:16) captioned reel. One repo, deployed on Vercel.
Guiding rule: **use as few free-tier units as possible** — three external services (MongoDB Atlas, Cloudinary, Stripe), no queue service, no paid AI calls on the hot path.

## Flow

```
Browser ─► POST /api/jobs ─► Mongo job(queued) ─► 202
             └─ after(): claim job → captions → pick window → download slice → ffmpeg 9:16 + captions → Cloudinary upload → job(done)
Browser polls GET /api/jobs/:id (backoff 2s→10s) ─► signed Cloudinary URL
Stripe ─► /api/billing/webhook ─► Mongo subscription state
Vercel Cron: /api/cron/keepalive (weekly)   /api/cron/recover (daily, Phase 2)
```

## Key decisions

| Decision                                                                        | Why                                                               |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Pick the moment from **captions**, not the video                                | No AI/Whisper quota; no full download                             |
| Download only the **10–20 s slice at ≤720p**                                    | Small, fast, fits a 300 s function                                |
| Crop/caption with **ffmpeg in the function**                                    | Zero Cloudinary transformations; Cloudinary is storage + CDN only |
| **Mongo is the queue** (atomic `findOneAndUpdate`, lock expiry, max 3 attempts) | No Upstash/QStash to keep alive or run out of                     |
| **TTL indexes** expire jobs (30 d) and rate-limit counters                      | No cleanup code; keeps Atlas under 512 MB                         |
| Rate limit = Mongo fixed-window counter                                         | No Redis                                                          |
| Weekly **keepalive cron**                                                       | Atlas free clusters pause after 30 days idle                      |

## Modules (`lib/`)

`env` validated config · `db` client + indexes · `queue` job lifecycle · `rate-limit` · `validators` YouTube URL allow-list · `cron-auth` bearer check · `keepalive` · `highlight/` captions + window picker · `source/` yt-dlp slice · `render/` ffmpeg crop + SRT · `run` safe process spawning (arg arrays, no shell).

## Data (Mongo)

- `jobs`: `{ userId, videoId, status: queued|processing|done|failed, attempts, lockedUntil, result, createdAt }` — indexes `{status,lockedUntil}`, `{userId,createdAt}`, TTL on `createdAt`.
- `rate_limits`: `{ _id: key:bucket, count, expiresAt }` — TTL on `expiresAt`.
- `heartbeats`: one doc, written by the keepalive cron.

## Security

URLs parsed to an 11-char video id (strict host allow-list; the raw string never reaches yt-dlp) · processes spawned with argument arrays · cron endpoints need `Bearer $CRON_SECRET` (constant-time compare) · users may only read their own jobs (Phase 2/3) · Stripe webhook signature verification (Phase 3) · "I have the rights" confirmation required on every job.

## Known risks (see Phase 0 findings)

1. YouTube access from datacenter IPs and the yt-dlp JS-challenge requirement.
2. YouTube ToS forbids downloading; commercial exposure.
3. Vercel Hobby is non-commercial; real scale means paid tiers.

## Phase 0 outcome (decision)

yt-dlp failed on 3 real videos: YouTube now needs a JS runtime plus a challenge solver downloaded from GitHub, and
datacenter IPs (Vercel) may be blocked on top of that. **Decision: upload-first.** A direct file upload is the main
source (`lib/source/upload-source.js`); `lib/source/youtube-slice.js` stays as an optional, unmeasured extra.
Uploads have no captions, so the window is `pickWindow`'s fallback and no captions are burned in until speech-to-text is added.
Local result: 40 s 720p input -> 15 s 720x1280 reel, 1.8 s, 1.7 MB (`node scripts/spike-upload.mjs <file>`).

## Phases 2-5 as built

- **Flow:** sign in (Google) -> `POST /api/uploads/sign` -> browser uploads straight to Cloudinary ->
  `POST /api/jobs` (checks the source URL is our own Cloudinary folder, spends one reel, queues the job,
  runs it with `after()`) -> browser polls `GET /api/jobs/[id]`, which also re-claims a stuck job.
- **Entitlements (`lib/entitlements.js`):** one free reel per account, 30 reels/month on Pro. Every spend is one atomic
  Mongo update. Failed jobs are refunded once (`refunded` flag). A global daily limit is the circuit breaker.
- **Billing:** only the verified Stripe webhook writes plan state; duplicate and out-of-order events are ignored.
- **Retention:** the daily recover cron deletes source and reel 7 days after a job finishes.
- **Security:** CSP and other headers in `next.config.js`; jobs are readable only by their owner; cron routes need the secret.
- **Tests:** `npm test` (unit and Mongo integration, 77 tests) and `npm run test:e2e` (Playwright on a production build with
  an in-memory Mongo and fake third-party keys).
- **Not covered by any test:** real Google sign-in, real Stripe, real Cloudinary, ffmpeg on Vercel.
