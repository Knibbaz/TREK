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


---

# Kritische toets tegen eigen plannen (FEATURES.md + specs) — 2026-06-13

Per PR beoordeeld of de implementatie écht past bij de eigen
roadmap-acceptatiecriteria en de fork-architectuur.

## #961 Privé-paklijsten — past goed, met twee kanttekeningen
- **Dekt P2.3.2 volledig**: gedeeld/persoonlijk (eigen vinkstatus, zichtbaar
  voor anderen) /privé (alleen eigenaar) is precies het roadmap-criterium, en
  templates blijven werken.
- **Dekt P2.3.1 NIET**: "wie neemt de tent mee"-eigenaarschap op groepsniveau
  blijft open. De fork-toewijzing per packing-categorie (packing_tagged-
  notificatie) blijft daarvoor de basis — niet laten sneuvelen bij de merge.
- **Kanttekening 1**: fork CSV-export (PackingHeader) moet de nieuwe
  categorie-typen meenemen (kolom 'visibility' toevoegen bij overname).
- **Kanttekening 2**: raakt 89 files in het packing-domein dat upstream net
  refactorde — pas overnemen als upstream hem merged, anders dubbel werk.

## #1099 Trip overview — geen botsing, fork-panel blijkt wees
- Fork's `TripOverviewPanel.tsx` is een **lijst**-overzicht per dag en wordt
  sinds de port **nergens meer geïmporteerd** (wees-component). PR #1099 is
  een **kaart**-overzicht (hele-trip-route). Complementair, geen overlap.
- Actie bij overname: fork-panel verwijderen óf juist weer aanhaken als
  lijst-variant naast de kaartknop. Besluit nodig (zie DECISIONS.md).

## #1142 Mobile route tools — pure bugfix, geen risico
- Fork draait exact deze upstream-planner; bug zit dus ook in ROUTD.
  Cherry-pick is veilig (geen fork-aanpassingen in die regio).

## #1156 Bag colors — veilig
- `BAG_COLORS` leeft in `packingService.ts` + client-constants; beide
  bestanden zijn in de fork ongewijzigd upstream. Clean cherry-pick.

## #879 iCal-sync — pas op met token-model
- Fork heeft al `exportICS` (handmatige download) en een eigen
  share-token-systeem (`share_tokens`, collab-invites, journey-tokens).
  De PR introduceert een eigen calendar-token. Bij overname: aansluiten op het
  bestaande share-token-patroon i.p.v. een vierde tokensoort toevoegen.
- Past bij de doelgroep (vriendengroepen plannen in agenda's) — geen
  roadmap-item maar wél in lijn met P1 "samenwerken zonder gedoe".

## #1151 Catalaans — alleen met na-bewerking
- Na overname moet het parity-script de ±760 fork-keys aanvullen, anders
  faalt de eigen i18n-parity-test direct.

## #1035 LDAP — herwaardering: relevanter dan eerst gedacht
- De agency-spec (B2B, `Possible customers.md`) mikt op touroperators die
  soms on-premise/AD draaien. Voor white-label-verkoop (open verzoek A in
  DECISIONS.md) kan LDAP een verkoopargument zijn. Nog steeds niet nú
  overnemen, maar van "negeren" naar "bewaren voor B2B-fase".

## #912 Helm chart — idem herwaardering
- De fork sleept een eigen chart mee (`charts/trek`, name=routd). Als
  white-label-klanten op k8s hosten wordt dit relevant. Parkeren, niet
  negeren.

## #974 Maps search bias — overbodig voor de fork
- Fork heeft locationBias + types al in autocomplete (lokaal geport); de
  search-variant voegt weinig toe en de PR is draft met rebase-ruis.

## #578 Vacay sharing — botst frontaal met fork
- Fork herbouwde `vacay_entries` (uren/type/UNIQUE) en heeft eigen
  sharing-semantiek (share_vacay_in_groups-setting). Deze PR herstructureert
  hetzelfde domein vanaf de oude basis. **Niet overnemen**; hooguit het
  read-only-concept als idee meenemen in een eigen implementatie.
