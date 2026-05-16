# Slack Media Support — Design Spec

**Date:** 2026-05-16
**Status:** Approved, ready for implementation plan
**Goal:** Bring Slack inbound media handling to parity with Telegram so agents can "see" images and other files uploaded in Slack.

---

## Problem

The Telegram integration downloads photos, documents, audio, voice (with Whisper transcription), video, and video_note messages, then injects a `local_file:` path into the agent context so Claude Code can Read the file. The Slack integration has zero media handling:

- `SlackMessageEvent` does not capture the `files[]` array.
- `SlackPoller.fetchHistory` filters require `m.text` to be truthy, so a pure-image message with no caption is dropped during catch-up.
- `SlackAPI` has no file download capability.
- There is no `src/slack/media.ts`.
- There are no Slack media format functions in `fast-checker.ts`.
- The Slack bot lacks the `files:read` OAuth scope.

Result: when a user uploads an image to Slack, the agent receives only the text (if any), never the file.

## Approach

Approach A (parallel module). The codebase keeps `telegram/` and `slack/` modules parallel and separate (each has its own `api.ts`, `poller.ts`, `logging.ts`, `index.ts`), not shared. Add `src/slack/media.ts` as the natural parallel to `telegram/media.ts`. This introduces no regression risk on the production-critical Telegram path. `transcribe.ts` is already transport-agnostic (takes a file path) and is reused directly, not duplicated.

Rejected alternatives:
- **B (shared media core):** refactoring `telegram/media.ts` touches code running in production on 3 agents — regression risk on a live system outweighs the DRY benefit.
- **C (inline in agent-manager):** `agent-manager.ts` is already 600+ lines and inline handling cannot be unit-tested in isolation.

## Scope

Full parity with Telegram: all media categories (photo, document, audio, voice with transcription, video). Slack has no `video_note` concept, so that type simply never occurs from Slack — parity means the same processing pipeline, not fabricating types that do not exist on the platform.

Rollout: code is universal across all agents. The manual `files:read` scope + app reinstall is applied to all 3 production Slack apps (maestro, imager, analist) after the code lands.

## Architecture and Data Flow

```
Socket Mode message event (files[])
  -> SlackPoller emits SlackMessageEvent with files
  -> agent-manager handler: allowed_user + channel gate (BEFORE any download)
  -> processSlackMedia(event, slackApi, downloadDir)   [src/slack/media.ts]
  -> per file: map mimetype -> category, download with auth header, save locally
  -> FastChecker.formatSlack{Photo,Document,Voice,Video}Message -> local_file: <path>
  -> queueTelegramMessage (with isDuplicate dedup on catch-up)
  -> agent reads the file with the Read tool
```

Security posture is preserved: the allowed_user + channel gate runs before any file is fetched. Files from a non-whitelisted user or unexpected channel are never downloaded. The fail-closed behavior (poller refuses to start without `SLACK_ALLOWED_USER`) is unchanged.

## Components

### New files

**`src/slack/media.ts`**
- `processSlackMedia(event, slackApi, downloadDir): Promise<ProcessedSlackMedia[]>`
- Returns an array because Slack allows multiple files per message.
- Reuses `transcribeVoice` from `src/telegram/transcribe.ts`.
- `ProcessedSlackMedia` interface mirrors `ProcessedMedia`:
  `{ type, channel, from, text, ts, image_path?, file_path?, file_name?, transcript? }`
- Reuses `sanitizeFilename` (exported from `telegram/media.ts` via `telegram/index.ts`).

**`tests/slack-media.test.ts`**
- Mocks `SlackAPI.downloadFile`.
- Asserts: each mimetype maps to the correct category; multiple files produce multiple results; download is invoked with the auth header; a message with no files returns an empty array; filenames are sanitized; a download failure on one file skips that file and continues with the rest.

### Modified files

**`src/slack/poller.ts`**
- `SlackMessageEvent` gains `files?: SlackFile[]` and `subtype?: string`.
- `SlackFile` interface: `{ id, name, mimetype, filetype, url_private_download, url_private, size }`.
- `fetchHistory` filter changes from requiring `m.text` to accepting a message when it has text OR a non-empty `files` array. Files are mapped into the returned events.

**`src/slack/api.ts`**
- `SlackAPI` retains the bot token in a private field (currently it only stores a `WebClient`).
- New method `downloadFile(url: string): Promise<Buffer>` using `fetch(url, { headers: { Authorization: 'Bearer ' + token } })`. Throws on non-OK HTTP status so the caller can skip that file.

**`src/daemon/agent-manager.ts`**
- In the Slack `onMessage` handler and the catch-up loop, after the allowed_user + channel gate: if `event.files?.length`, construct a `SlackAPI` from `slackBotToken`, call `processSlackMedia`, and inject one formatted message per file.
- `downloadDir = join(agentDir, 'slack-files')` (parallel to `telegram-images`).
- Paths are made relative with the existing `toRel(...)` helper before injection.
- Catch-up uses the existing `checker.isDuplicate(formatted)` dedup, same as the text path.

**`src/daemon/fast-checker.ts`**
- Add `formatSlackPhotoMessage`, `formatSlackDocumentMessage`, `formatSlackVoiceMessage`, `formatSlackVideoMessage`.
- Parallel to the Telegram equivalents, but the header is `=== SLACK PHOTO from <user> (channel:<channel>) ===` and the reply directive is `Reply using: cortextos bus send-slack <channel> "<your reply>"`.
- Each emits the same generic `local_file: <path>` block the agent already understands.

**`src/telegram/transcribe.ts`**
- The only shared Telegram code touched. Generalize the WAV path derivation from `oggPath.replace(/\.ogg$/i, '.wav')` to `replace(/\.[^.]+$/, '.wav')`.
- Additive and backward-compatible: Telegram still sends `.ogg`, and ffmpeg accepts any input format, so Slack voice files in other formats transcribe correctly.

## Slack mimetype to category mapping

| Slack mimetype  | Category  | Treatment                                  |
|-----------------|-----------|--------------------------------------------|
| `image/*`       | photo     | `image_path`, agent reads with Read        |
| `audio/*`       | voice     | `file_path` + transcript via whisper.cpp   |
| `video/*`       | video     | `file_path`                                |
| anything else   | document  | `file_path` + sanitized `file_name`        |

## Error Handling and Edge Cases

- **Image-only message, no text:** processed normally, caption is an empty string (fixed by the `fetchHistory` filter change).
- **Multiple files per message:** loop; one injected message per file (the agent reads one `local_file:` at a time).
- **Download failure on one file:** skip that file, log, continue with the remaining files (graceful, mirrors Telegram returning null).
- **Voice with no whisper installed:** the agent still receives the audio path, no transcript (existing graceful degradation in `transcribe.ts`).
- **Files from a bot or a non-whitelisted user / wrong channel:** filtered by the existing gates before any download.
- **`file_share` subtype:** handled by checking `event.files` rather than the subtype string.

## Testing

- `tests/slack-media.test.ts` as described under New files.
- `npm run build` must compile cleanly (TypeScript strict mode).
- `npm test` — the full existing suite must stay green (no regression, especially the Telegram media and Slack inbound security tests).

## Manual Rollout (after code lands)

For each of maestro, imager, analist:
1. Slack App -> OAuth & Permissions -> Bot Token Scopes -> add `files:read`.
2. Reinstall to Workspace.
3. Restart the daemon.

Then update `SLACK-SETUP.md`: add `files:read` to the scope lists (both orchestrator and standard agent) and add it to the 2026 verified-scopes table.

## Constraints

- No em dash anywhere in code or strings.
- TypeScript strict mode; no new runtime dependencies beyond `package.json`.
- File writes use atomic helpers where the existing pattern does.
- `SLACK_ALLOWED_USER` fail-closed behavior must remain intact.
