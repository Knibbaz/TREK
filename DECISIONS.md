# ROUTD — Beslissingen & verzoekenlog

> Doel: alle gemaakte keuzes en gestelde verzoeken op één plek, zodat je er
> later naar terug kunt verwijzen. Nieuwste bovenaan per sectie aanvullen.
> Zusterdocumenten: `PORT_STATUS.md` (technisch restwerk van de port),
> `FEATURES.md` (feature-status), `UPSTREAM_PRS.md` (upstream-PR-beoordeling).

---

## Gemaakte keuzes (chronologisch)

### 2026-06-12 — Upstream-port
1. **Strategie**: niet doormodderen op de oude Express-architectuur, maar een
   nieuwe branch `port/upstream-dev` vanaf upstream/dev (NestJS + React 19) en
   daar de fork-features in mergen. Eigen keuze van Bas na afweging
   ("gefaseerd" vs "alles in één keer" vs "alleen pre-migratie").
   `dev` blijft intact; backup-branch `backup/dev-pre-upstream-merge-2026-06-12`.
2. **Hybride architectuur**: fork-Express-routers via `legacyBridge.ts` +
   `forkExtras/` pre-Nest-init gemount; later geleidelijk omzetten naar
   Nest-modules.
3. **Upstream wint** bij: OSRM-routing (i.p.v. fork hybrid-auto), ReservationModal
   (multi-leg flights i.p.v. fork-metavelden), trip-shrink-gedrag (#909),
   BudgetPanel → Costs (Splitwise-style), packing/places/todo refactors.
4. **Fork wint** bij: day-notes blijven privé in share-links, vacay-uren/TvT,
   GDPR-deletion met bedenktijd (i.p.v. directe delete), explore/creator-stack,
   eigen docker-workflow (basabbink/routd).
5. **Branding**: TREK→ROUTD in shared i18n, wiki, MCP-strings; instance-branding
   via admin (logo/kleuren/naam) bleef behouden in authService app-config.
6. **i18n**: alle 19 talen op en-key-pariteit gebracht met en-placeholders voor
   onvertaalde fork-keys.
7. **Database-waarschuwing**: bestaande DB's (fork óf upstream) kunnen niet
   zomaar upgraden — migratie-indexen verschillen. Verse DB of handmatige bridge.
8. **Push-beleid**: alléén naar origin (Knibbaz/TREK), nooit naar upstream.
   Branch-tracking expliciet omgezet naar origin.

### 2026-06-12 — Documentatie
9. **FEATURES.md**: alle planning-.md's samengevoegd tot één statusoverzicht,
   geverifieerd tegen de code (roadmap-statussen waren verouderd).
10. **UPSTREAM_PRS.md**: 10 open upstream-PR's beoordeeld; advies = #1142 en
    #1156 cherry-picken, #961 (privé-paklijsten) volgen, rest afwachten/negeren.

### 2026-06-13 — Fork-UI's teruggehangen (PORT_STATUS 🔌-items)
11. AdminPage kreeg Explore-moderatie/Payouts/Branding/Insights/GDPR-tabs terug;
    Dashboard publish-knop; visitor-poll op publieke pagina's; Unsplash-picker;
    GPX-export-knop. Alles met upstream-architectuur (hook-pages + losse
    componenten in `client/src/pages/admin/AdminForkTabs.tsx`).
12. **Default currency** toegevoegd aan Admin → Default User Settings
    (`default_currency` in `DEFAULTABLE_USER_SETTING_KEYS`).
13. **Missende vertalingen**: app-brede scan op gebruikte `t()`-keys; 62
    ontbrekende keys (o.a. vacay.tripDates, groups.*, explore.*) met nette
    en+nl-teksten toegevoegd; overige talen op en-placeholder-pariteit.

---

## Openstaande verzoeken (nog te doen)

### A. ~~White-label verkoop + superadmin-rol~~  *(gevraagd én gebouwd 2026-06-13)*
- **Gebouwd**: rol `superadmin` (instellen via env `SUPERADMIN_EMAIL`, wordt bij
  boot gepromoveerd). Superadmin = admin + White-label-tab in /admin waarmee
  per menu-item bepaald wordt wat het klant-adminaccount ziet
  (`whitelabel_disabled_admin_tabs` in app_settings). Klant-admin kan het
  superadmin-account niet bewerken/verwijderen. Default-naam blijft ROUTD
  (brand_name-fallback).
- Open: welke runtime-settings nog meer exclusief superadmin moeten worden.
- App moet als white-label verkoopbaar zijn, met **ROUTD als default-naam**.
- Nieuwe rol bóven admin (bijv. `superadmin`/`owner`): Bas houdt dit account,
  de klant krijgt het admin-account.
- Vanuit superadmin: **admin-menu-items per instance aan/uit kunnen zetten**
  (klantafspraken: bepaalde tabs/features verbergen voor de klant-admin).
- Te bepalen: welke settings exclusief superadmin worden (branding? addons?
  platform-fees?).

### B. Styling-consistentie + World Map + bucket-list  *(gevraagd 2026-06-13)*
- Groups, Explore, Creator Hub, Payments & Payouts visueel gelijktrekken met
  de huidige (upstream glass/Tailwind-token) stijl van de app.
- **World Map verwijderen** (addon + routes + nav).
- Nieuwe feature: **bucket-list per land** — mooie plekken bewaren per land
  (in Atlas of als lijst), en die lijst automatisch tonen wanneer je een trip
  naar dat land/locatie aanmaakt. → ook opnemen in FEATURES.md.

### C. Upstream-PR's kritisch toetsen aan eigen plannen  *(gevraagd 2026-06-13)*
- UPSTREAM_PRS.md naast FEATURES.md en de eigen specs leggen: past de
  implementatie van bijv. #961 (privé-paklijsten) en #1099 (trip overview)
  echt bij de eigen roadmap-acceptatiecriteria, of botst het?

### D. Dit log bijhouden  *(gevraagd 2026-06-13)*
- Bij elke substantiële keuze of nieuw verzoek: regel toevoegen in dit bestand.

### E. ~~Missende vertalingen en/nl~~  *(gevraagd én afgerond 2026-06-13)*
- Zie keuze #13 hierboven.

### F. Dashboard-tijdzones koppelen aan geplande trips  *(gevraagd 2026-06-13)*
- De klokjes/tijdzones op het dashboard moeten de tijdzones tonen van trips
  die naar een andere tijdzone gepland zijn dan waar je nu zit.

### G. P1.1.4 afmaken: poll-beslissing  *(gevraagd 2026-06-13)*
- "Beslissing"-badge in het tripoverzicht na het sluiten van een poll.
- Optioneel: automatisch een place aanmaken van de winnende poll-optie.

### H. Template-bibliotheek / bucket-list per land  *(gevraagd 2026-06-13)*
- Agency-spec 4.1 (template-bibliotheek) gecombineerd met de bucket-list-wens
  uit verzoek B: herbruikbare lijst van mooiste plekken per land die opduikt
  bij het plannen van een trip naar dat land.

### I. Kaart laadt pas na page-reload  *(gevraagd 2026-06-13)*
- Bug: pagina met kaart toont de kaart pas na een handmatige reload.
