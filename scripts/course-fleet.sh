#!/usr/bin/env bash
#
# course-fleet.sh - Adoarme sau trezeste flota de agenti de CURS (demo).
#
# Flotele de curs nu ruleaza zilnic. Stau adormite implicit (nu pornesc la boot,
# nu consuma tokeni) si le trezesti doar cand filmezi demo sau adaugi agenti.
#
# Flote de curs gestionate aici:
#   - nova-danut-mitrut (Telegram): orchestrator, telegram-analyst, copywriter,
#                                    nova-video, nova-designer, nova-social-media,
#                                    nova-web-designer, nova-director-marketing,
#                                    nova-evaluator-marketing, nova-specialist-tehnic
#   - nova-mitrut-danut (Slack):    boss, analyst
#
# NU atinge NICIODATA flota ta de productie (dm-brain-orchestra pe Slack) si nici
# Mister O (open-clawd-agent pe Telegram, in afara cortextos). Acelea raman mereu.
#
# Usage:
#   ./course-fleet.sh wake     porneste toti agentii de curs (consuma tokeni)
#   ./course-fleet.sh sleep    opreste toti agentii de curs
#   ./course-fleet.sh status   arata starea curenta (implicit)

set -uo pipefail

# Fiecare intrare este agent:org (org e necesar pentru `enable`).
COURSE_AGENTS=(
  "orchestrator:nova-danut-mitrut"
  "telegram-analyst:nova-danut-mitrut"
  "copywriter:nova-danut-mitrut"
  "nova-video:nova-danut-mitrut"
  "nova-designer:nova-danut-mitrut"
  "nova-social-media:nova-danut-mitrut"
  "nova-web-designer:nova-danut-mitrut"
  "nova-director-marketing:nova-danut-mitrut"
  "nova-evaluator-marketing:nova-danut-mitrut"
  "nova-specialist-tehnic:nova-danut-mitrut"
  "boss:nova-mitrut-danut"
  "analyst:nova-mitrut-danut"
)

INSTANCE="${CTX_INSTANCE_ID:-default}"
ENABLED_JSON="${HOME}/.cortextos/${INSTANCE}/config/enabled-agents.json"
CMD="${1:-status}"

show_status() {
  echo "Starea flotei de curs (${ENABLED_JSON}):"
  python3 - "$ENABLED_JSON" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print(f"  nu pot citi enabled-agents.json: {e}"); sys.exit(0)
course = {"orchestrator","telegram-analyst","copywriter","nova-video",
          "nova-designer","nova-social-media","nova-web-designer",
          "nova-director-marketing","nova-evaluator-marketing",
          "nova-specialist-tehnic","boss","analyst"}
for name in sorted(course):
    info = d.get(name, {})
    state = "TREAZ" if info.get("enabled") else "doarme"
    org = info.get("org", "?")
    print(f"  {state:<7} {name:<18} ({org})")
PY
}

case "$CMD" in
  wake)
    echo "Trezesc flota de curs (${#COURSE_AGENTS[@]} agenti)."
    echo "ATENTIE: fiecare agent porneste o sesiune Claude = consum de tokeni."
    for entry in "${COURSE_AGENTS[@]}"; do
      agent="${entry%%:*}"; org="${entry##*:}"
      echo "--- enable ${agent} (${org}) ---"
      cortextos enable "$agent" --org "$org"
    done
    echo ""
    show_status
    ;;
  sleep)
    echo "Adorm flota de curs (${#COURSE_AGENTS[@]} agenti)."
    for entry in "${COURSE_AGENTS[@]}"; do
      agent="${entry%%:*}"
      echo "--- disable ${agent} ---"
      cortextos disable "$agent"
    done
    echo ""
    show_status
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: $(basename "$0") {wake|sleep|status}"
    exit 1
    ;;
esac
