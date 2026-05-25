# Autonomous Roadmap Agent — Complete Implementation Plan

**Author:** Brian Clark
**Project:** Operation Money Tree — Roadmap Sync Agent
**Phase:** Pilot (2-week eval, 90% accuracy gate before auto-update)
**Target Stack:** Claude Agent SDK + Node scheduler + Python connectors
**Existing roadmap repo:** `bcali/roadmap-dashboard` (branch: `main`)

---

## Table of Contents

1. Overview & Principles
2. Architecture & Data Flow
3. Phase 1 — Setup & Infrastructure
4. Phase 2 — Connector Modules (Teams, Outlook, Slack, Claude Summary)
5. Phase 3 — Agent Core Logic
6. Phase 4 — Audit & Eval Framework
7. Phase 5 — Graduation & Auto-Update
8. Implementation Checklist
9. Appendix — API Credentials & Setup

---

## 1. Overview & Principles

### What this agent does

Every night (target: 00:00 Asia/Bangkok), the agent:

1. Pulls the last 24h of **Teams meeting transcripts** (Microsoft Graph).
2. Fetches recent **Outlook emails** relevant to Operation Money Tree (Microsoft Graph).
3. Ingests **Slack conversations** from tracked channels (Slack SDK).
4. Reads your **daily Claude conversation summary** (`claude_summary.md`, committed to the roadmap repo by a separate end-of-day job).
5. **Synthesizes** all sources with Claude to detect blockers, epic slips, dependency shifts, and risk changes.
6. Emits a **structured JSON proposal** of roadmap changes plus a human-readable audit summary.
7. **Logs** everything for your morning review.
8. After **90% accuracy over 2 weeks**, graduates to **auto-applying** changes to `roadmap.json`.

### Design principles

- **Persistence** — runs autonomously on a schedule; never manually triggered.
- **Adaptive logic** — no rigid keyword rules. The agent learns what matters from your accept/dismiss feedback, pattern-matched against your past escalations and status updates.
- **Over-flag, then prune** — bias toward surfacing too much. Dismissals are training signal; this is intentional during the pilot.
- **Auditable** — every proposed change cites its source (which Slack message, which transcript line, which email) so you can see *why* it fired.
- **Staged rollout** — proposal-only mode for two weeks. Zero surprise writes to the roadmap until the accuracy gate is cleared.

### Success metrics (2-week eval)

| Metric | Definition | Gate |
|---|---|---|
| Blocker detection accuracy | Correct blocker vs. routine-update classification | ≥ 90% |
| Dependency tracking | Slips correctly linked to affected epics + business case | ≥ 90% |
| Signal-to-noise | % of proposed changes worth acting on | tracked, trending up |
| Stakeholder value | Did the audit surface what leadership needed? | qualitative, your call |

---

## 2. Architecture & Data Flow

```
[ Nightly scheduler (Node, node-cron) — 00:00 Asia/Bangkok ]
        |
        v
[ Data collection layer (Python) ]
   |-- Teams transcripts        (Microsoft Graph)
   |-- Outlook emails           (Microsoft Graph)
   |-- Slack messages           (Slack SDK)
   |-- Claude summary MD         (GitHub repo)
        |
        v
[ Normalization ]
   - Deduplicate
   - Align timestamps to Asia/Bangkok
   - Extract entities (epics, people, $ amounts)
        |
        v
[ Claude agent core — synthesis + reasoning ]
   - Identify blockers
   - Detect epic slips / scope changes
   - Map dependencies
   - Recalculate business-case / risk impact
   - Score confidence per change
        |
        v
[ Outputs ]
   - data/outputs/YYYY-MM-DD_proposed_changes.json
   - data/outputs/YYYY-MM-DD_audit_summary.md
        |
        v
[ Your morning review ]  -> accept / dismiss / question
        |
        v
[ Feedback store (evals.jsonl) ]  -> trains confidence thresholds
        |
        v
[ Week 3+ : auto-update roadmap.json once 90% gate cleared ]
```

### Sources mapped to signal types

| Source | Signal type | Example |
|---|---|---|
| Slack | Blocker mentions, dependency calls, scope chatter | "CKO sign-off blocked on unaccounted fees" |
| Teams transcripts | Official decisions, escalations, resource constraints | "IT email provisioning delayed Wave 1 onboarding" |
| Outlook | Formal notices, stakeholder flags, deadline changes | "CFO requesting revised business case Friday" |
| Claude summary MD | Your own synthesis, risks, next steps | "IBE guest-currency dev capacity blocking 5 epics" |

---

## 3. Phase 1 — Setup & Infrastructure

### 3.1 Repository structure

```
roadmap-agent/
├── .env.example
├── .env                      # gitignored — you fill in
├── .gitignore
├── README.md
├── requirements.txt
├── package.json
├── scheduler.js              # Node cron entrypoint
├── config/
│   ├── channels.json         # Slack channels to monitor
│   └── settings.json         # thresholds, timezone, retention
├── src/
│   ├── orchestrator.py       # main coordinator
│   ├── connectors/
│   │   ├── __init__.py
│   │   ├── teams_connector.py
│   │   ├── outlook_connector.py
│   │   ├── slack_connector.py
│   │   └── github_connector.py
│   ├── normalize/
│   │   └── normalize.py
│   ├── agent/
│   │   ├── agent.py          # Claude synthesis
│   │   └── prompts.py        # system prompt + few-shot
│   ├── audit/
│   │   ├── logger.py
│   │   ├── feedback_store.py
│   │   └── eval_metrics.py
│   └── utils/
│       ├── auth.py
│       └── config.py
├── data/
│   ├── roadmap.json          # pulled from bcali/roadmap-dashboard
│   ├── kpis.json
│   ├── claude_summary.md     # daily, committed by EOD job
│   ├── evals.jsonl           # your feedback
│   └── outputs/
│       ├── YYYY-MM-DD_proposed_changes.json
│       └── YYYY-MM-DD_audit_summary.md
└── tests/
    ├── test_connectors.py
    ├── test_normalize.py
    └── test_agent.py
```

### 3.2 `.env.example`

```
# Microsoft Graph (Teams + Outlook)
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=
GRAPH_USER_ID=            # your user id / UPN

# Slack
SLACK_BOT_TOKEN=xoxb-
SLACK_USER_TOKEN=xoxp-    # needed for DM/private history

# GitHub (roadmap repo + Claude summary)
GITHUB_TOKEN=ghp_
GITHUB_REPO=bcali/roadmap-dashboard
GITHUB_BRANCH=main

# Claude
ANTHROPIC_API_KEY=sk-ant-

# Agent config
TIMEZONE=Asia/Bangkok
RUN_TIME=00:00
ACCURACY_THRESHOLD=0.90
AUDIT_RETENTION_DAYS=30
```

### 3.3 `requirements.txt`

```
anthropic>=0.40
python-dotenv>=1.0
requests>=2.31
slack-sdk>=3.27
msal>=1.28
aiohttp>=3.10
pydantic>=2.6
python-dateutil>=2.9
pytz>=2024.1
PyGithub>=2.3
```

### 3.4 `package.json`

```json
{
  "name": "roadmap-agent-scheduler",
  "version": "1.0.0",
  "main": "scheduler.js",
  "type": "module",
  "scripts": {
    "start": "node scheduler.js",
    "run-once": "python -m src.orchestrator"
  },
  "dependencies": {
    "node-cron": "^3.0.3",
    "dotenv": "^16.4.5"
  }
}
```

### 3.5 `scheduler.js` (Node cron entrypoint)

```javascript
import cron from "node-cron";
import { spawn } from "child_process";
import dotenv from "dotenv";
dotenv.config();

const TZ = process.env.TIMEZONE || "Asia/Bangkok";

// Runs the Python orchestrator once.
function runOrchestrator() {
  const ts = new Date().toISOString();
  console.log(`[${ts}] Starting nightly roadmap sync...`);
  const proc = spawn("python", ["-m", "src.orchestrator"], { stdio: "inherit" });
  proc.on("close", (code) => {
    console.log(`[${new Date().toISOString()}] Orchestrator exited with code ${code}`);
  });
}

// 00:00 every day in the configured timezone.
cron.schedule("0 0 * * *", runOrchestrator, { timezone: TZ });

console.log(`Roadmap agent scheduled for 00:00 ${TZ}. Waiting...`);

// Allow a manual immediate run with:  node scheduler.js --now
if (process.argv.includes("--now")) runOrchestrator();
```

---

## 4. Phase 2 — Connector Modules

> All connectors return a normalized list of dicts:
> `{ "source", "timestamp_utc", "author", "text", "ref" }`
> where `ref` is a stable pointer back to the original (message ts, transcript id, email id).

### 4.1 Teams transcript connector — `src/connectors/teams_connector.py`

```python
import os
import requests
from datetime import datetime, timedelta, timezone
import msal


GRAPH = "https://graph.microsoft.com/v1.0"


def _token() -> str:
    app = msal.ConfidentialClientApplication(
        client_id=os.environ["AZURE_CLIENT_ID"],
        client_credential=os.environ["AZURE_CLIENT_SECRET"],
        authority=f"https://login.microsoftonline.com/{os.environ['AZURE_TENANT_ID']}",
    )
    result = app.acquire_token_for_client(
        scopes=["https://graph.microsoft.com/.default"]
    )
    if "access_token" not in result:
        raise RuntimeError(f"Graph auth failed: {result.get('error_description')}")
    return result["access_token"]


def fetch_transcripts(hours: int = 24) -> list[dict]:
    """Pull transcripts for the user's online meetings created in the last N hours.

    NOTE: requires application permission OnlineMeetingTranscript.Read.All
    and an org consent / access policy. Transcripts are only available after
    the meeting ends and before they expire.
    """
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    user = os.environ["GRAPH_USER_ID"]
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    out: list[dict] = []
    meetings = requests.get(
        f"{GRAPH}/users/{user}/onlineMeetings",
        headers=headers,
        params={"$filter": f"creationDateTime ge {since}"},
        timeout=30,
    ).json().get("value", [])

    for m in meetings:
        tlist = requests.get(
            f"{GRAPH}/users/{user}/onlineMeetings/{m['id']}/transcripts",
            headers=headers, timeout=30,
        ).json().get("value", [])
        for t in tlist:
            content = requests.get(
                f"{GRAPH}/users/{user}/onlineMeetings/{m['id']}/transcripts/{t['id']}/content",
                headers={**headers, "Accept": "text/vtt"}, timeout=60,
            ).text
            out.append({
                "source": "teams",
                "timestamp_utc": t.get("createdDateTime"),
                "author": m.get("subject", "meeting"),
                "text": content,
                "ref": f"teams:{m['id']}:{t['id']}",
            })
    return out
```

### 4.2 Outlook connector — `src/connectors/outlook_connector.py`

```python
import os
import requests
from datetime import datetime, timedelta, timezone
from .teams_connector import _token, GRAPH


def fetch_emails(hours: int = 24, keywords: list[str] | None = None) -> list[dict]:
    """Fetch recent messages, optionally filtered by Operation Money Tree keywords."""
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    user = os.environ["GRAPH_USER_ID"]
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    params = {
        "$filter": f"receivedDateTime ge {since}",
        "$select": "subject,from,receivedDateTime,bodyPreview,body",
        "$top": "50",
        "$orderby": "receivedDateTime desc",
    }
    msgs = requests.get(
        f"{GRAPH}/users/{user}/messages", headers=headers, params=params, timeout=30
    ).json().get("value", [])

    out = []
    for msg in msgs:
        text = msg.get("body", {}).get("content") or msg.get("bodyPreview", "")
        if keywords and not any(k.lower() in (msg.get("subject", "") + text).lower()
                                for k in keywords):
            continue
        out.append({
            "source": "outlook",
            "timestamp_utc": msg.get("receivedDateTime"),
            "author": msg.get("from", {}).get("emailAddress", {}).get("address", ""),
            "text": f"{msg.get('subject','')}\n\n{text}",
            "ref": f"outlook:{msg.get('id','')}",
        })
    return out
```

### 4.3 Slack connector — `src/connectors/slack_connector.py`

```python
import os
import time
from datetime import datetime, timedelta, timezone
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


def fetch_messages(channels: list[str], hours: int = 24) -> list[dict]:
    """Fetch messages from the given channel IDs over the last N hours.

    Bot token scopes needed: channels:history, groups:history, users:read.
    Handles pagination + basic rate-limit backoff.
    """
    client = WebClient(token=os.environ["SLACK_BOT_TOKEN"])
    oldest = (datetime.now(timezone.utc) - timedelta(hours=hours)).timestamp()
    out: list[dict] = []

    for ch in channels:
        cursor = None
        while True:
            try:
                resp = client.conversations_history(
                    channel=ch, oldest=str(oldest), limit=200, cursor=cursor
                )
            except SlackApiError as e:
                if e.response.status_code == 429:
                    time.sleep(int(e.response.headers.get("Retry-After", "5")))
                    continue
                raise
            for msg in resp.get("messages", []):
                out.append({
                    "source": "slack",
                    "timestamp_utc": datetime.fromtimestamp(
                        float(msg["ts"]), tz=timezone.utc
                    ).isoformat(),
                    "author": msg.get("user", msg.get("bot_id", "")),
                    "text": msg.get("text", ""),
                    "ref": f"slack:{ch}:{msg['ts']}",
                })
            cursor = resp.get("response_metadata", {}).get("next_cursor")
            if not cursor:
                break
    return out
```

### 4.4 GitHub / Claude-summary connector — `src/connectors/github_connector.py`

```python
import os
import base64
import requests


def fetch_text_file(path: str) -> str:
    """Read a UTF-8 text file from the roadmap repo (e.g. claude_summary.md)."""
    repo = os.environ["GITHUB_REPO"]
    branch = os.environ.get("GITHUB_BRANCH", "main")
    token = os.environ["GITHUB_TOKEN"]
    url = f"https://api.github.com/repos/{repo}/contents/{path}"
    r = requests.get(
        url, headers={"Authorization": f"Bearer {token}"},
        params={"ref": branch}, timeout=30,
    )
    r.raise_for_status()
    return base64.b64decode(r.json()["content"]).decode("utf-8")


def fetch_json_file(path: str) -> str:
    """Convenience wrapper returning raw JSON text (roadmap.json / kpis.json)."""
    return fetch_text_file(path)
```

### 4.5 Daily Claude summary job (separate, lightweight)

The agent does **not** try to persist Claude memory. Instead, an end-of-day job appends a short dated summary to `claude_summary.md` and commits it to the repo. You can trigger this yourself or wire it into your existing prompt-library tooling. Minimum useful shape:

```markdown
## 2026-05-23
- Blockers raised: <...>
- Decisions made: <...>
- Epics touched: <DS-020, FX-..., ...>
- Next steps / risks: <...>
```

The nightly agent reads only the entries from the last 24h.

---

## 5. Phase 3 — Agent Core Logic

### 5.1 System prompt — `src/agent/prompts.py`

```python
SYSTEM_PROMPT = """You are a roadmap synthesis agent for "Operation Money Tree",
a payments-modernization program. Each night you receive raw signals from Slack,
Teams transcripts, Outlook, and a daily Claude summary, plus the current roadmap
state (epics, statuses, business-case values).

Your job: detect what CHANGED versus the current roadmap and propose updates.

Rules:
- Bias toward OVER-flagging during the pilot. If a signal plausibly indicates a
  blocker, slip, scope change, or risk shift, surface it.
- Every proposed change MUST cite the source ref(s) that triggered it.
- Map each change to an existing epic_id when possible; if it implies a new epic
  or dependency, say so explicitly.
- Recalculate business-case / risk impact only when the signals support it; show
  your reasoning briefly.
- Assign a confidence score 0.0-1.0 per change.
- NEVER invent facts not present in the signals or roadmap.

Output ONLY valid JSON matching the ProposedChanges schema. No prose, no markdown.
"""

FEWSHOT = """Example signal -> change:
Signal (slack:C123:1690000000.0001):
  "CKO sign-off still blocked — Sehba waiting on our approval of the clearing file."
Current roadmap: epic ORCH-014 status = "in_progress".
Proposed change:
  { "epic_id": "ORCH-014", "change_type": "blocker",
    "summary": "CKO clearing-file sign-off blocked pending your approval",
    "source_refs": ["slack:C123:1690000000.0001"], "confidence": 0.86 }
"""
```

### 5.2 Output schema (Pydantic) — embedded in `src/agent/agent.py`

```python
from pydantic import BaseModel
from typing import Literal


class Change(BaseModel):
    epic_id: str | None
    change_type: Literal["blocker", "slip", "scope", "risk", "status", "new"]
    summary: str
    source_refs: list[str]
    confidence: float
    business_case_delta: str | None = None


class ProposedChanges(BaseModel):
    run_date: str
    changes: list[Change]
    notes: str | None = None
```

### 5.3 Synthesis call — `src/agent/agent.py`

```python
import os
import json
from anthropic import Anthropic
from .prompts import SYSTEM_PROMPT, FEWSHOT
from .agent import ProposedChanges  # if split, import accordingly


def synthesize(signals: list[dict], roadmap_json: str, kpis_json: str,
               run_date: str) -> dict:
    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    user_payload = {
        "run_date": run_date,
        "roadmap": json.loads(roadmap_json),
        "kpis": json.loads(kpis_json),
        "signals": signals,
    }

    resp = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=4000,
        system=SYSTEM_PROMPT + "\n\n" + FEWSHOT,
        messages=[{
            "role": "user",
            "content": "Here are tonight's inputs as JSON. Return ProposedChanges "
                       "JSON only.\n\n" + json.dumps(user_payload, default=str),
        }],
    )

    raw = "".join(b.text for b in resp.content if b.type == "text").strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    return ProposedChanges(**json.loads(raw)).model_dump()
```

### 5.4 Orchestrator — `src/orchestrator.py`

```python
import os
import json
from datetime import datetime
import pytz
from dotenv import load_dotenv

from src.connectors import (
    teams_connector, outlook_connector, slack_connector, github_connector,
)
from src.normalize.normalize import normalize
from src.agent.agent import synthesize
from src.audit.logger import write_outputs

load_dotenv()
KEYWORDS = ["money tree", "operation money tree", "juspay", "checkout.com",
            "airwallex", "blocker", "slip", "at risk"]


def main() -> None:
    tz = pytz.timezone(os.environ.get("TIMEZONE", "Asia/Bangkok"))
    run_date = datetime.now(tz).strftime("%Y-%m-%d")

    with open("config/channels.json") as f:
        channels = json.load(f)["channels"]

    # 1. Collect
    signals = []
    for collect in (
        lambda: teams_connector.fetch_transcripts(24),
        lambda: outlook_connector.fetch_emails(24, KEYWORDS),
        lambda: slack_connector.fetch_messages(channels, 24),
    ):
        try:
            signals += collect()
        except Exception as e:  # one source failing should not kill the run
            print(f"[warn] collector failed: {e}")

    try:
        summary = github_connector.fetch_text_file("data/claude_summary.md")
        signals.append({"source": "claude_summary", "timestamp_utc": run_date,
                        "author": "brian", "text": summary,
                        "ref": "github:data/claude_summary.md"})
    except Exception as e:
        print(f"[warn] summary fetch failed: {e}")

    # 2. Normalize
    signals = normalize(signals)

    # 3. Current roadmap state
    roadmap = github_connector.fetch_json_file("data/roadmap.json")
    kpis = github_connector.fetch_json_file("data/kpis.json")

    # 4. Synthesize
    proposal = synthesize(signals, roadmap, kpis, run_date)

    # 5. Write outputs (proposal-only during pilot)
    write_outputs(run_date, proposal, signals)
    print(f"[ok] wrote proposal for {run_date}: {len(proposal['changes'])} changes")


if __name__ == "__main__":
    main()
```

### 5.5 Normalization — `src/normalize/normalize.py`

```python
import hashlib


def normalize(signals: list[dict]) -> list[dict]:
    """Deduplicate and trim. Keeps the first occurrence of identical text."""
    seen: set[str] = set()
    out: list[dict] = []
    for s in signals:
        text = (s.get("text") or "").strip()
        if not text:
            continue
        key = hashlib.sha256(text.encode()).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        s["text"] = text[:8000]  # cap very long transcripts per item
        out.append(s)
    return out
```

---

## 6. Phase 4 — Audit & Eval Framework

### 6.1 Output writer — `src/audit/logger.py`

```python
import os
import json


def write_outputs(run_date: str, proposal: dict, signals: list[dict]) -> None:
    os.makedirs("data/outputs", exist_ok=True)

    with open(f"data/outputs/{run_date}_proposed_changes.json", "w") as f:
        json.dump(proposal, f, indent=2)

    lines = [f"# Roadmap Agent — Audit Summary {run_date}", ""]
    lines.append(f"**Signals ingested:** {len(signals)}  ")
    lines.append(f"**Proposed changes:** {len(proposal['changes'])}")
    lines.append("")
    for i, c in enumerate(proposal["changes"], 1):
        lines.append(f"## {i}. [{c['change_type'].upper()}] {c.get('epic_id','(unmapped)')}")
        lines.append(f"- {c['summary']}")
        lines.append(f"- Confidence: {c['confidence']:.2f}")
        if c.get("business_case_delta"):
            lines.append(f"- Business-case impact: {c['business_case_delta']}")
        lines.append(f"- Sources: {', '.join(c['source_refs'])}")
        lines.append("")
    with open(f"data/outputs/{run_date}_audit_summary.md", "w") as f:
        f.write("\n".join(lines))
```

### 6.2 Feedback store — `src/audit/feedback_store.py`

```python
import json
from datetime import datetime, timezone


def record_feedback(run_date: str, change_index: int, verdict: str,
                    note: str = "") -> None:
    """verdict in {accept, dismiss, edit}. One JSON line per decision."""
    entry = {
        "logged_at": datetime.now(timezone.utc).isoformat(),
        "run_date": run_date,
        "change_index": change_index,
        "verdict": verdict,
        "note": note,
    }
    with open("data/evals.jsonl", "a") as f:
        f.write(json.dumps(entry) + "\n")
```

### 6.3 Accuracy gate — `src/audit/eval_metrics.py`

```python
import json
from datetime import datetime, timedelta, timezone


def rolling_accuracy(days: int = 14) -> float:
    """Accuracy = accepted / (accepted + dismissed) over the trailing window.
    'edit' counts as a partial accept (0.5)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    score, total = 0.0, 0
    try:
        with open("data/evals.jsonl") as f:
            for line in f:
                e = json.loads(line)
                if datetime.fromisoformat(e["logged_at"]) < cutoff:
                    continue
                total += 1
                score += {"accept": 1.0, "edit": 0.5, "dismiss": 0.0}.get(
                    e["verdict"], 0.0)
    except FileNotFoundError:
        return 0.0
    return score / total if total else 0.0


def gate_cleared(threshold: float = 0.90, days: int = 14,
                 min_samples: int = 20) -> bool:
    """True only with enough samples AND accuracy at/above threshold."""
    count = 0
    try:
        with open("data/evals.jsonl") as f:
            count = sum(1 for _ in f)
    except FileNotFoundError:
        return False
    return count >= min_samples and rolling_accuracy(days) >= threshold
```

### 6.4 Daily review loop (your 15 minutes each morning)

1. Open `data/outputs/<today>_audit_summary.md`.
2. For each change: accept, dismiss, or edit.
3. Record each with `record_feedback(...)` (wire a tiny CLI or paste into a notebook).
4. Check `rolling_accuracy()` once a week to see the trend toward the gate.

---

## 7. Phase 5 — Graduation & Auto-Update

Once `gate_cleared()` returns `True` (≥ 20 samples, ≥ 90% over trailing 14 days), flip the orchestrator from proposal-only to write mode.

### 7.1 Roadmap writer (only invoked after gate clears)

```python
import os
import base64
import json
import requests


def commit_roadmap(updated_roadmap: dict, run_date: str) -> None:
    """Commit an updated roadmap.json back to the repo with an audit message."""
    repo = os.environ["GITHUB_REPO"]
    branch = os.environ.get("GITHUB_BRANCH", "main")
    token = os.environ["GITHUB_TOKEN"]
    path = "data/roadmap.json"
    url = f"https://api.github.com/repos/{repo}/contents/{path}"
    headers = {"Authorization": f"Bearer {token}"}

    sha = requests.get(url, headers=headers, params={"ref": branch},
                       timeout=30).json()["sha"]
    body = {
        "message": f"agent: roadmap auto-update {run_date}",
        "content": base64.b64encode(
            json.dumps(updated_roadmap, indent=2).encode()).decode(),
        "sha": sha,
        "branch": branch,
    }
    requests.put(url, headers=headers, json=body, timeout=30).raise_for_status()
```

### 7.2 Guardrails after graduation

- Keep writing the audit summary every night even in auto mode — you still skim it.
- Only auto-apply changes with `confidence >= 0.75`; anything lower stays proposal-only.
- Every commit is a separate, revertable change on `main` (or push to a branch + auto-PR if you want a second gate).
- If rolling accuracy drops below 0.85 in any trailing week, the orchestrator falls back to proposal-only automatically.

---

## 8. Implementation Checklist

**Phase 1 — Setup**
- [ ] Create `roadmap-agent/` repo with the structure above
- [ ] Fill `.env` from `.env.example`
- [ ] `pip install -r requirements.txt` and `npm install`
- [ ] Confirm `roadmap.json` / `kpis.json` are readable from `bcali/roadmap-dashboard`

**Phase 2 — Connectors**
- [ ] Register Azure app, grant Graph permissions, test Teams + Outlook pulls
- [ ] Create Slack app, add scopes, list channel IDs into `config/channels.json`
- [ ] Verify GitHub connector reads `claude_summary.md`
- [ ] Stand up the daily Claude-summary commit job

**Phase 3 — Agent**
- [ ] Drop in prompts + schema
- [ ] Run `python -m src.orchestrator` once manually; inspect the JSON + MD outputs

**Phase 4 — Audit/Eval (Weeks 1–2)**
- [ ] Schedule nightly run via `scheduler.js`
- [ ] Review every morning; record feedback
- [ ] Watch `rolling_accuracy()` trend

**Phase 5 — Graduation (Week 3+)**
- [ ] When `gate_cleared()` is True, enable `commit_roadmap`
- [ ] Confirm guardrails (confidence floor, auto-fallback) are active

---

## 9. Appendix — API Credentials & Setup

### Microsoft Graph (Teams + Outlook)
1. Azure Portal → App registrations → New registration ("Roadmap Agent").
2. Certificates & secrets → new client secret → copy to `.env`.
3. API permissions (application): `OnlineMeetingTranscript.Read.All`, `Mail.Read`. Grant admin consent.
4. Transcript access also needs an application access policy (Teams admin / PowerShell) authorizing the app for your user.
5. Copy Client ID + Tenant ID to `.env`; set `GRAPH_USER_ID` to your UPN.

### Slack
1. api.slack.com → Create New App → From scratch.
2. OAuth & Permissions → Bot scopes: `channels:history`, `groups:history`, `im:history`, `users:read`, `chat:write`.
3. Install to workspace → copy `xoxb-` token (and `xoxp-` user token if you need DMs/private history) to `.env`.
4. Get channel IDs (channel → details → bottom) into `config/channels.json`:
   ```json
   { "channels": ["C0XXXX1", "C0XXXX2"] }
   ```

### GitHub
1. github.com/settings/tokens → fine-grained or classic token with `repo` scope.
2. Copy to `GITHUB_TOKEN`.

### Claude API
1. console.anthropic.com → API keys → create key → copy to `ANTHROPIC_API_KEY`.
2. Model string used here: `claude-opus-4-7` (swap to a faster model for cheaper nightly runs if you prefer).

---

*End of plan. This is a pilot scaffold — expect to iterate connector auth and the system prompt over the first week as you see real signals flow through.*
