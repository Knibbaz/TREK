# Upstream PR's (mauriceboe/TREK) — relevantie voor ROUTD

> Peildatum: 2026-06-12 · 10 open PR's op upstream · gesorteerd op meerwaarde
> voor de fork (branch `port/upstream-dev`).
>
> Overnemen kan per PR: `git fetch upstream pull/<nr>/head:pr-<nr>` en dan
> cherry-picken/mergen op de port-branch.

## 🔥 Hoge meerwaarde — overwegen om nu al binnen te halen

### #961 — Personal & private packing categories
- **Wat**: gedeelde/persoonlijke/privé-categorieën in paklijsten; eigen
  check-status per lid; templates ondersteunen het.
- **Waarom relevant**: dit is letterlijk **P2.3.2 "Privé paklijsten"** uit je
  eigen roadmap (status ❌) — iemand anders heeft hem gebouwd.
- **Let op**: groot (+3272/-974, 89 files) en raakt het packing-systeem dat
  upstream net refactorde; wachten tot upstream hem merged is veiliger dan
  zelf vooruit cherry-picken.

### #1142 — Fix: route tools bereikbaar in mobiele day-plan sheet
- **Wat**: bugfix — route-toggle/optimize/profielkeuze waren op mobiel
  onbereikbaar omdat de sheet sluit bij dag-selectie.
- **Waarom relevant**: de fork draait nu exact deze upstream-planner; de bug
  zit dus ook in ROUTD. Klein (+114/-31), merge-status **clean**.
- **Advies**: direct cherry-picken.

### #1156 — Meer bag-kleuren (8 → 16)
- **Wat**: trivialiteit, lost herhalende kleuren op bij >8 bags.
- **Waarom relevant**: fork gebruikt bag-tracking. +2/-2, **clean**.
- **Advies**: direct cherry-picken (1 minuut werk).

## 👍 Interessant — volgen en overnemen zodra upstream merged

### #1099 — Trip overview button (hele-trip-route op kaart)
- **Wat**: knop die de route van de complete reis toont i.p.v. per dag.
- **Waarom relevant**: nuttige planner-feature; **maar** de fork heeft al een
  eigen `TripOverviewPanel.tsx` — eerst checken op overlap/dubbeling voordat
  je hem overneemt.

### #879 — Calendar sync (iCal-link met share-token)
- **Wat**: permanente .ics-feed per trip; abonneren vanuit Google/Apple
  Calendar.
- **Waarom relevant**: veelgevraagde QoL-feature, past bij je doelgroep
  (vriendengroepen plannen in agenda's). Fork heeft al ICS-export
  (`exportICS`), dit maakt er een levend abonnement van.
- **Let op**: merge-status **dirty** (conflicten met upstream-dev) en al van
  april — kans dat hij herschreven moet worden. Niet zelf fixen; afwachten.

### #1151 — Catalaanse vertaling
- **Wat**: complete `ca`-locale in de nieuwe shared i18n-structuur.
- **Waarom relevant**: gratis extra taal. **Let op**: na overname moet jouw
  parity-script de fork-keys (≈700) als en-placeholder aanvullen, net als bij
  de andere talen.

## 🤷 Lage prioriteit voor ROUTD

### #1035 — LDAP-auth
- Zelfhost-doelgroep met LDAP/AD. Fork heeft al OIDC + passkeys. Alleen
  relevant als een agency-/B2B-klant erom vraagt (zie agency-spec §auth).

### #974 — Maps search location bias + place types (draft)
- Fork heeft de autocomplete-variant hiervan al (locationBias + types,
  lokaal geport). De search-bias is een kleine aanvulling; draft en groot
  door rebase-ruis. Afwachten.

### #578 — Vacay sharing read-only i.p.v. fusion (draft, april)
- Botst vrijwel zeker met de fork-vacay (uren/TvT/comp-time rebuild van
  `vacay_entries`). Overslaan tenzij upstream hem merged — dan zorgvuldig
  handmatig porten.

### #912 — Helm chart security/scheduling/network policies
- Alleen voor Kubernetes-deployments. ROUTD deployt via eigen Docker-image
  (basabbink/routd). Negeren tenzij je naar k8s gaat.

---

## Samengevat advies

| Nu doen | Wachten op upstream-merge | Negeren |
|---------|---------------------------|---------|
| #1142 (mobile route fix), #1156 (bag colors) | #961 (privé-paklijsten!), #1099, #879, #1151 | #1035, #974, #578, #912 |

Tip: zet een terugkerende check op upstream-merges — vooral #961 dekt een
open punt uit je eigen roadmap volledig af.
