---
title: Voice Metrics Dashboard
emoji: 📊
colorFrom: indigo
colorTo: green
sdk: static
app_file: index.html
short_description: KPIs & timeline for voice-agent transcripts, in-browser
---

# Voice Metrics Dashboard

Paste a voice-agent transcript JSON → instant conversation KPIs, turn timeline and gap analysis.
100% in-browser (vanilla JS + Chart.js), nothing uploaded.

**Accepts:** `[{speaker, start, end, text?}]` (seconds or `"mm:ss"`), `{"turns":[...]}` wrappers,
and common aliases (`role`, `t0`/`t1`, `segments`, `utterances`).

**KPIs:** turns · duration · talk-time share per speaker · median & p95 turn gap · longest silence ·
interruptions (overlapping turns) · words/second · estimated containment (handoff-phrase heuristic).

**Load demo** for a banking-style Spanish dialogue with one interruption and one handoff.

KPI thinking from *trajectory grammars for voice-agent conversations* (D. García Peña) —
research: https://huggingface.co/iamdgarcia
