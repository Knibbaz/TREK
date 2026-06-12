# ROUTD fork — port naar upstream NestJS-basis (juni 2026)

Branch `port/upstream-dev` = upstream/dev (TREK 3.0.22, NestJS + React 19 +
shared Zod-contracts) + alle fork-features gemerged (`git merge ebddef14`).
`dev` is onaangeroerd gelaten als fallback; backup-branch:
`backup/dev-pre-upstream-merge-2026-06-12`.

## Architectuur van de port

- **Nest serveert alle upstream-domeinen.** De fork-features draaien als
  Express-routers die in `bootstrap.ts` vóór `app.init()` op de onderliggende
  Express-instance gemount worden — zelfde patroon als upstreams platform-routes.
  Zie `server/src/routes/legacyBridge.ts`.
- **`server/src/routes/forkExtras/`** bevat fork-endpoints die in upstreams
  migratie uit de oude basis-routebestanden (admin/places/share/trips/atlas/
  vacay/categories) zouden zijn verdwenen: branding-API, payouts/platform-fee/
  mollie-fees, creator-moderatie, place-votes/foto's/GPX-export,
  unsplash cover-search, collab-invites, share-visits, residency/volunteering,
  vacay uren, categories `/my`.
- **Migraties:** 63 fork-migraties zijn als blok vóór upstreams
  atlas-reconciliatie (de laatste entry) in `migrations.ts` gezet. Verse DB's
  draaien alles in volgorde. ⚠️ **Bestaande databases** (zowel fork- als
  upstream-historie) hebben een ANDERE versieteller en kunnen NIET zomaar
  upgraden — verse DB of handmatige bridge nodig.
- **i18n:** fork-keys naar `shared/src/i18n` geport; alle 19 locales op
  en-key-pariteit (en-tekst als placeholder waar vertaling ontbreekt);
  externalNotifications uitgebreid met `date_proposal_*` + `explore_update`;
  TREK→ROUTD rebrand toegepast op shared i18n + wiki.

## Bewust gekozen upstream-gedrag (fork-variant vervallen)

- Routing/kaart: upstream OSRM-stack (FOSSGIS-profielen, RouteWithLegs,
  multi-leg flights) i.p.v. fork hybrid-auto-routing; route-thresholds-settings
  UI verwijderd (keys bestaan nog server-side, ongebruikt).
- ReservationModal: upstream-versie (multi-leg flights) — fork
  vlucht/trein-metavelden + locatie-autocomplete vervallen.
- Trip-shrink: upstream verwijdert overloopdagen (#909/#1083) i.p.v.
  fork "maak dateless".
- Day-notes blijven privé in share-links (fork-beleid behouden; test aangepast).
- Place-photo bytes niet meer publiek; upstream share-token-proxy dekt het.

## Nog te porten (features nu NIET actief)

1. **AdminPage fork-tabs**: BrandingPanel, CreatorApplicationQueue,
   GdprAdminPanel, VisitorInsightsPanel, payouts/fees-UI bestaan als component
   maar zijn niet in de nieuwe `useAdmin`-AdminPage gehangen. (Server-API's
   werken al via forkExtras.)
2. **DashboardPage fork-extra's**: publish-naar-Explore-knop, concept-filter.
3. **SharedTripPage / JourneyPublicPage**: visitor-tracking (`useTrackVisit`),
   VisitorPoll, branding-footer (test geskipt met verwijzing hierheen).
4. **PlacesSidebar**: GPX-export-knop + inline day-picker (tests verwijderd
   met NOTE; server-endpoint voor GPX werkt al).
5. **Unsplash cover-suggesties** in TripFormModal (server-endpoints
   `/trips/cover-search` + `/unsplash-download` werken al via forkExtras).
6. **AtlasPage residency/volunteering UI** (server-API werkt al).
7. **LoginPage** gebruikt branding-logo's (geport), maar de overige
   ROUTD-strings in upstream-componenten zijn nog niet allemaal nagelopen.
8. Vertalingen: ±650 nieuwe upstream-keys per locale staan als en-placeholder.

## Langetermijn

- forkExtras/legacyBridge-routers stap voor stap omzetten naar Nest-modules.
- `docker.yml` workflow is fork-eigen (basabbink/routd) en bewust behouden.
