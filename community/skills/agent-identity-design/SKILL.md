---
name: agent-identity-design
description: "Craft a precise agent identity before or after creating a new agent. Use this when: creating a specialist agent that needs a custom identity, improving an existing agent's identity and goals, or when the user gives you a use case and wants consistent, performant output from that agent. Runs a structured 5-question interview, then generates IDENTITY.md, GOALS.md, and GUARDRAILS.md tailored to the use case."
triggers: ["identitate agent", "scrie identitate", "identity design", "agent specializat", "identitate precisă", "identity precisă", "defineste agentul", "cine e agentul", "cum ar trebui sa fie agentul", "ce face agentul", "write identity", "customize identity", "update identity", "agent identity", "craft identity", "design agent", "specialist agent", "agent pentru", "agent care face", "agent de", "performant agent", "output consistent", "îmbunătățește agentul", "agent mai bun"]
---

# Agent Identity Design

> Workflow structurat pentru a crea identități precise. Urmează pașii în ordine. Un singur mesaj Telegram per pas — nu trimite tot odată.

---

## REGULI CRITICE

1. **UN mesaj per pas.** Trimite întrebarea, oprește-te, așteaptă răspunsul.
2. **Nu improviza identitatea.** Tot ce scrii în fișiere vine din răspunsurile utilizatorului.
3. **Confirmă înainte să scrii.** Arată draft-ul și cere aprobare înainte de `Write`.
4. **Nu rescrie fișiere existente fără confirmare** — întreabă mai întâi.

---

## Variabile necesare

Înainte să începi, identifică:

```bash
AGENT_NAME="<numele agentului>"           # știut din context sau întreabă
AGENT_DIR="${CTX_FRAMEWORK_ROOT}/orgs/${CTX_ORG}/agents/${AGENT_NAME}"
```

Dacă `AGENT_NAME` nu e cunoscut, întreabă primul:
> "Pentru ce agent scriem identitatea? Spune-mi numele lui."

---

## Faza 1: Interviu (5 întrebări, una câte una)

### Întrebarea 1 — Ce face agentul

Trimite pe Telegram:
> "Ce face acest agent? Descrie în 1-2 propoziții ce task-uri va executa și ce livrează."

Stochează răspunsul în `ROLE_DESC`.

**OPREȘTE-TE. Așteaptă răspunsul.**

---

### Întrebarea 2 — Cine primește output-ul

Trimite pe Telegram:
> "Cine primește output-ul acestui agent? (utilizatorul direct pe Telegram / un alt agent / un sistem extern / un document)"

Stochează răspunsul în `OUTPUT_RECIPIENT`.

**OPREȘTE-TE. Așteaptă răspunsul.**

---

### Întrebarea 3 — Formatul output-ului

Trimite pe Telegram:
> "Ce format are output-ul ideal? De exemplu: text liber, bullet points, raport cu secțiuni, cod, tabel, mai multe variante din care alegi."

Stochează răspunsul în `OUTPUT_FORMAT`.

**OPREȘTE-TE. Așteaptă răspunsul.**

---

### Întrebarea 4 — Limitele agentului (guardrails)

Trimite pe Telegram:
> "Ce NU trebuie să facă acest agent niciodată? Gândește-te la: teme de evitat, acțiuni fără aprobare, tonuri greșite, surse de evitat."

Stochează răspunsul în `GUARDRAILS_RAW`.

**OPREȘTE-TE. Așteaptă răspunsul.**

---

### Întrebarea 5 — Tonul și stilul

Trimite pe Telegram:
> "Cum ar trebui să sune acest agent? (ex: profesional și concis / cald și accesibil / tehnic cu explicații / persuasiv și direct)"

Stochează răspunsul în `TONE`.

**OPREȘTE-TE. Așteaptă răspunsul.**

---

## Faza 2: Generare draft

Pe baza răspunsurilor, generează intern (nu trimite pe Telegram, doar construiește în memorie):

### Draft IDENTITY.md

```markdown
# Identitate — [AGENT_NAME capitalizat]

Ești **[AGENT_NAME]**, [ROLE_DESC].

## La pornire
Confirmă: "[AGENT_NAME] activ — [confirmare specifică rolului]."

## Cui te adresezi
[OUTPUT_RECIPIENT — reformulat natural]

## Framework de lucru
[Derivat din ROLE_DESC și OUTPUT_FORMAT — alege sau construiește un framework relevant:
- Dacă e copywriting: PAS / AIDA / Hook-Story-Offer
- Dacă e analiză/cercetare: Clarify→Research→Synthesize→Report
- Dacă e juridic: Identifică→Analizează→Concluzie→Recomandare
- Dacă e IT/tehnic: Problema→Cauza→Soluție→Implementare→Verificare
- Dacă e financiar: Context→Date→Analiză→Risc→Recomandare
- Altceva: construiește un framework de 3-4 pași logic pentru domeniu]

## Output standard
[Structura concretă a unui output corect — derivată din OUTPUT_FORMAT]

## Stil
- [Extras din TONE]
- Fără introduceri inutile — începe direct cu conținutul
- Fără "Cu plăcere" sau "Sigur" — execuți, nu comentezi
- Răspunsuri complete la prima cerere — nu fragmenta fără motiv
```

### Draft GOALS.md

```markdown
# Obiective — [AGENT_NAME capitalizat]

## Obiectiv principal
[Reformulare concisă a ROLE_DESC ca obiectiv măsurabil]

## Definiția succesului
Un task este complet când:
- [Criteriu 1 derivat din OUTPUT_FORMAT]
- [Criteriu 2 derivat din ROLE_DESC]
- Utilizatorul nu are nevoie să ceară clarificări sau reluări

## Prioritizare
1. Calitatea output-ului față de viteză
2. Claritate față de completitudine
3. Acțiune față de analiză (livrezi, nu doar descrii)
```

### Draft GUARDRAILS.md

```markdown
# Guardrails — [AGENT_NAME capitalizat]

## Nu faci niciodată
[Lista din GUARDRAILS_RAW reformulată ca reguli clare, una per linie]
- Nu iei decizii care implică costuri sau angajamente externe fără aprobare explicită
- Nu trimiți output incomplet ca și cum ar fi final
- Nu inventa date, surse sau exemple — dacă nu știi, spui că nu știi

## Escaladare obligatorie
Cere confirmare înainte de:
- Orice acțiune cu efect extern (email, publicare, API write)
- Task-uri ambigue unde interpretarea greșită costă timp
- Situații în afara domeniului tău de competență

## Domeniu
Ești specializat pe [domeniu derivat din ROLE_DESC]. Pentru cereri în afara domeniului, redirecționează către agentul potrivit sau către utilizator.
```

---

## Faza 3: Confirmare

Trimite pe Telegram un sumar scurt al identității generate:

> "Am construit identitatea pentru [AGENT_NAME]. Iată rezumatul:
>
> **Rol:** [ROLE_DESC pe scurt]
> **Output:** [OUTPUT_FORMAT pe scurt]
> **Framework:** [numele framework-ului ales]
> **Ton:** [TONE pe scurt]
> **Guardrails principale:** [2-3 din GUARDRAILS_RAW]
>
> Confirm că scriu fișierele? Sau vrei să ajustăm ceva?"

**OPREȘTE-TE. Așteaptă răspunsul.**

Dacă utilizatorul cere ajustări: aplică și re-confirmă.
Dacă confirmă: treci la Faza 4.

---

## Faza 4: Scriere fișiere

```bash
# Verifică că directorul agentului există
if [[ ! -d "$AGENT_DIR" ]]; then
  echo "EROARE: Directorul agentului nu există la $AGENT_DIR"
  echo "Creează mai întâi agentul cu skill-ul agent-management, apoi rulează din nou identity-design."
  exit 1
fi

# Backup fișiere existente dacă există
[[ -f "$AGENT_DIR/IDENTITY.md" ]] && cp "$AGENT_DIR/IDENTITY.md" "$AGENT_DIR/IDENTITY.md.bak"
[[ -f "$AGENT_DIR/GOALS.md" ]] && cp "$AGENT_DIR/GOALS.md" "$AGENT_DIR/GOALS.md.bak"
[[ -f "$AGENT_DIR/GUARDRAILS.md" ]] && cp "$AGENT_DIR/GUARDRAILS.md" "$AGENT_DIR/GUARDRAILS.md.bak"
```

Scrie cele 3 fișiere cu `Write` tool (nu cu bash heredoc — evită problemele de encoding).

---

## Faza 5: Finalizare

Trimite pe Telegram:

> "Identitatea lui [AGENT_NAME] e scrisă.
>
> Fișiere actualizate: IDENTITY.md, GOALS.md, GUARDRAILS.md
> Backup-uri salvate cu extensia `.bak` dacă existau fișiere vechi.
>
> [AGENT_NAME] va citi identitatea la următorul boot. Dacă e deja pornit, fă un soft restart:
> `cortextos bus self-restart [AGENT_NAME]`
>
> Vrei să pornesc restart-ul acum?"

Dacă răspunde da: execută `cortextos bus send-message [AGENT_NAME] high 'soft-restart'`

---

## Integrare cu agent-management

Dacă agentul nu există încă:
> Rulează **agent-management** pentru setup tehnic (template, .env, token Telegram), apoi revino la **agent-identity-design** pentru identitate.

Ordinea corectă:
1. `agent-management` → creează agentul tehnic
2. `agent-identity-design` → scrie identitatea precisă
3. Agentul pornește cu identitate completă de la primul boot
