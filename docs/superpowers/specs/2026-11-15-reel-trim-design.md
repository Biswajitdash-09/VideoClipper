# Reel trim editor: short design

## Intent and why

Users want to pick the moment in their video, not get a fixed automatic 15 s window. The app renders exactly that cut. Results are not kept: no saved reel link, no "Recent reels" list.

## Goals

- Before uploading, the user previews their local file in the browser, sets a start point, and picks a length from 10, 15, 20, 25 or 30 s. Quick presets set the length from the start point.
- The server renders that range as a 720x1280 vertical reel.
- Download is the only way to get the reel. The server streams it, then deletes it.

## Non-goals

- Multi-cut timelines, joining sections, captions, filters.
- Re-downloading after a refresh or keeping a history.
- Lengths over 30 s (keeps renders inside Vercel Hobby's ~60 s function limit).

## Anti-goals

- A trim that silently produces a different range than the one shown.
- Reels left in Cloudinary after download, other than the 7-day sweep as a backup.

## Constraints

- The source upload still goes to Cloudinary first (Vercel's 4.5 MB body limit), so the source file exists briefly.
- Entitlements stay exactly as they are (one atomic spend, one refund on failure). The job record stays, because it drives the spend, the refund and polling.

## Approaches

1. **Server streams, then deletes (chosen).** `GET /api/jobs/[id]/download` streams the reel from Cloudinary, then deletes it and clears the stored file name. The Cloudinary link is never shown. No re-download.
2. Browser tells us after saving: simpler, but a closed tab leaves the reel and its public link until the sweep.
3. Auto-expire after 1 hour: least code, but reels live for an hour and can be shared.

## Design

- **Editor (client, `ReelMaker.js`):** file picked, local `<video>` via `URL.createObjectURL`. Controls: start slider (0 to duration minus chosen length), length select 10/15/20/25/30 (disabled values longer than the video), preview that loops the chosen range. Nothing uploads until "Make my reel".
- **Create job (`POST /api/jobs`):** body adds `start` (number, 0 or more) and `duration` (one of 10, 15, 20, 25, 30), checked in `createJobSchema`. Stored on the job.
- **Pipeline (`lib/process-job.js`):** replace the fixed `pickWindow` call with the job's `start` and `duration`. After probing, if `start + duration` exceeds the real length, fail the job with a clear message (refund applies). Delete the source from Cloudinary as soon as the render uploads.
- **Done state:** the job stores only the reel's file name until downloaded, not a URL. The dashboard drops the "Recent reels" list and its query.
- **Download (`GET /api/jobs/[id]/download`):** signed-in owner only, job must be done. Stream from Cloudinary with `Content-Disposition: attachment`. After the stream ends, delete the reel from Cloudinary and unset the file name. An interrupted download can be retried until the sweep.
- **Sweep (`/api/cron/recover`):** unchanged, still deletes anything older than 7 days.

## Left to the builder

- Exact slider and preview styling (follow `dashboard.css`).
- Whether the video player seeks with `timeupdate` or a range loop.
- Tests: schema limits, range-past-end failure, download streams then deletes, non-owner and not-done get refused, plus one Playwright test of the editor with a mocked upload.

## Risks

- The browser decides the video duration for the slider. The server re-checks with ffprobe, so a wrong browser value fails cleanly instead of rendering the wrong range.
- Some formats (for example HEVC .mov on certain browsers) do not preview in a `<video>` element. Fallback: show the length select without a preview and say why.
