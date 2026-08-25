#!/usr/bin/env bash
# hook-permission-slack.sh - Blocking PermissionRequest hook (Slack channel)
# Replaces hook-permission-telegram.sh post-Telegram retirement (2026-05-18).
# Sends permission prompts to a Slack channel. Polls for a response file written
# by fast-checker when the user replies "approve" or "deny" in Slack.
# Timeout: 120s (deny by default). Settings.json timeout should be 180s.

set -euo pipefail

# Read stdin FIRST before anything that might consume it
INPUT=$(cat)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/_ctx-env.sh" 2>/dev/null || true
TEMPLATE_ROOT="${CTX_FRAMEWORK_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
AGENT="${CTX_AGENT_NAME:-$(basename "$(pwd)")}"

# Source .env for SLACK vars if not already in environment
ENV_FILE="${CTX_AGENT_DIR:-.}/.env"
{ set +x; } 2>/dev/null
if [[ -f "$ENV_FILE" ]]; then
    set -a; source "$ENV_FILE"; set +a
elif [[ -f ".env" ]]; then
    set -a; source ".env"; set +a
fi

if [[ -z "${SLACK_BOT_TOKEN:-}" ]] || [[ -z "${SLACK_CHANNEL_ID:-}" ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"No Slack credentials configured for remote approval"}}}'
    exit 0
fi

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")

# ExitPlanMode and AskUserQuestion are handled by separate hooks — skip here
if [[ "$TOOL_NAME" == "ExitPlanMode" || "$TOOL_NAME" == "AskUserQuestion" ]]; then
    exit 0
fi

# Auto-approve edits to the agent's OWN .claude/ directory (configs/skills it
# manages at runtime). Precise path containment — NOT a substring match.
#   - Bash is never auto-approved (a command string can't be proven safe).
#   - Edit/Write only when file_path resolves inside <agentDir>/.claude/.
if [[ "$TOOL_NAME" == "Edit" || "$TOOL_NAME" == "Write" ]]; then
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
    if [[ -n "$FILE_PATH" && -n "${CTX_AGENT_DIR:-}" ]] && realpath -m / >/dev/null 2>&1; then
        AGENT_DIR="$CTX_AGENT_DIR"
        if [[ ! -L "${AGENT_DIR}/.claude" ]]; then
            CLAUDE_ROOT="$(realpath -m "${AGENT_DIR}/.claude")"
            case "$FILE_PATH" in
                /*) ABS_PATH="$FILE_PATH" ;;
                *)  ABS_PATH="${AGENT_DIR}/${FILE_PATH}" ;;
            esac
            RESOLVED="$(realpath -m "$ABS_PATH")"
            if [[ "$RESOLVED" == "$CLAUDE_ROOT" || "$RESOLVED" == "$CLAUDE_ROOT/"* ]]; then
                echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'
                exit 0
            fi
        fi
    fi
fi

# Build a human-readable tool summary
case "$TOOL_NAME" in
    Edit)
        FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // "unknown"' 2>/dev/null)
        OLD_STR=$(echo "$INPUT" | jq -r '.tool_input.old_string // ""' 2>/dev/null | head -c 300)
        NEW_STR=$(echo "$INPUT" | jq -r '.tool_input.new_string // ""' 2>/dev/null | head -c 300)
        TOOL_SUMMARY="File: ${FILE_PATH}
- ${OLD_STR}
+ ${NEW_STR}"
        ;;
    Write)
        FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // "unknown"' 2>/dev/null)
        CONTENT_PREVIEW=$(echo "$INPUT" | jq -r '.tool_input.content // ""' 2>/dev/null | head -c 300)
        TOOL_SUMMARY="File: ${FILE_PATH}
${CONTENT_PREVIEW}"
        ;;
    Bash)
        CMD_FULL=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)
        CMD=$(printf '%s' "$CMD_FULL" | head -c 1500)
        if [[ ${#CMD_FULL} -gt ${#CMD} ]]; then
            TOOL_SUMMARY="Command: ${CMD}
...(preview truncated — the FULL command runs if you approve)"
        else
            TOOL_SUMMARY="Command: ${CMD}"
        fi
        ;;
    *)
        TOOL_SUMMARY=$(echo "$INPUT" | jq -r '.tool_input // {}' 2>/dev/null | jq -c '.' 2>/dev/null | head -c 200)
        ;;
esac

# Generate unique ID for this request
UNIQUE_ID=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
HOOK_STATE_DIR="${CTX_ROOT:-${HOME}/.cortextos/default}/state/${AGENT}"
mkdir -p "${HOOK_STATE_DIR}"
RESPONSE_FILE="${HOOK_STATE_DIR}/hook-response-${UNIQUE_ID}.json"

cleanup() {
    rm -f "$RESPONSE_FILE"
}
trap cleanup EXIT

# Compose Slack message — agent / tool / actionable option (bar 1b)
MESSAGE="*PERMISSION REQUEST* (ID: ${UNIQUE_ID:0:8})
*Agent:* ${AGENT}
*Tool:* ${TOOL_NAME}

\`\`\`
${TOOL_SUMMARY}
\`\`\`

Reply *approve* or *deny* in this channel within 120s. No reply = auto-deny."

# Truncate if too long for Slack (max ~3000 chars safe)
if [[ ${#MESSAGE} -gt 2800 ]]; then
    MESSAGE="${MESSAGE:0:2800}...(truncated)"
fi

# Send to Slack channel via Slack Web API (curl — no PATH dependency)
_slack_send() {
    local channel="$1" text="$2"
    curl -sf \
        -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
        -H "Content-Type: application/json; charset=utf-8" \
        -d "$(jq -n --arg c "$channel" --arg t "$text" '{channel:$c,text:$t}')" \
        https://slack.com/api/chat.postMessage 2>/dev/null \
    | jq -r '.ok' 2>/dev/null || echo "false"
}

SEND_OK=$(_slack_send "${SLACK_CHANNEL_ID}" "${MESSAGE}")
if [[ "$SEND_OK" != "true" ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Failed to send permission request to Slack"}}}'
    exit 0
fi

# Poll for response file (fast-checker writes here on "approve"/"deny" reply)
ELAPSED=0
TIMEOUT=120
POLL_INTERVAL=2

while [[ $ELAPSED -lt $TIMEOUT ]]; do
    if [[ -f "$RESPONSE_FILE" ]]; then
        DECISION=$(jq -r '.decision // "deny"' "$RESPONSE_FILE" 2>/dev/null || echo "deny")

        if [[ "$DECISION" == "allow" ]]; then
            echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'
        else
            echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denied by user via Slack"}}}'
        fi
        exit 0
    fi

    sleep $POLL_INTERVAL
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

# Timeout — auto-deny (stdout suppressed to avoid polluting hook JSON output)
_slack_send "${SLACK_CHANNEL_ID}" "Permission request TIMED OUT (auto-denied): ${TOOL_NAME} on ${AGENT}" > /dev/null || true

echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Timed out waiting for Slack approval (120s)"}}}'
