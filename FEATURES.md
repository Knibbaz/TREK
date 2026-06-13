# ROUTD — Feature-overzicht & status

> Samenvoeging van alle planning-.md's: `Voya/MASTER_ROADMAP_GROUPTRIP.md`,
> `Voya/trek-explore-spec-4.md`, `Voya/trek-creator-hub-spec.md`,
> `Voya/trek-agency-spec.md`, `Groep als clubhuis.md`, `Group-check.md`,
> `Possible customers.md`.
>
> Status gecontroleerd tegen branch **`port/upstream-dev`** (upstream 3.0.22 +
> fork-features) op 2026-06-12. Gesorteerd op prioriteit/relevantie.
>
> Legenda: ✅ klaar · 🔌 server klaar, client-wiring mist (zie `PORT_STATUS.md`)
> · ⚠️ deels · ❌ niet gebouwd · ⬆️ door upstream-port binnengekomen

---

## P0 — Kaartfundament (alles af)

| # | Feature | Status |
|---|---------|--------|
| P0.1 | Public Map Parity (markers, thumbnails, routes, labels, badges, clustering) | ✅ |
| P0.2 | Enhanced tooltips publieke kaart | ✅ |
| P0.3 | Clickable markers + detail card | ✅ |
| P0.4 | Routevisualisatie & reistijden | ✅ ⬆️ verbeterd: echte OSRM-wegroutes per profiel + multi-leg flights |
| P0.5 | Order badges op markers | ✅ |
| P0.6 | Clustering bij lage zoom | ✅ |
| P0.7 | Basis performance | ✅ |

---

## P1 — Cruciaal voor groepen

### P1.1 Polls & stemmen — vrijwel af
| # | Feature | Status |
|---|---------|--------|
| P1.1.1 | Poll aanmaken (multi-step, types, deadline, anoniem, minimap, WS) | ✅ |
| P1.1.2 | Standaard stemmen (single/multi/ranked) | ✅ |
| P1.1.3 | Swipe poll (Tinder-style, confetti) | ✅ |
| P1.1.4 | Poll-resultaten & beslissing | ⚠️ grafiek/Borda/sluiten ✅; "Beslissing"-badge in tripoverzicht ❌; auto-place van winnaar ❌ |
| P1.1.5 | Gaststemmen via magic link | ✅ |

### P1.2 Beschikbaarheid-matching — af
| # | Feature | Status |
|---|---------|--------|
| P1.2.1 | Datumbereik-verzoek | ✅ |
| P1.2.2 | Beschikbaarheidsgrid (🟢🟡🔴, notities, snel-selectie, mobile) | ✅ |
| P1.2.3 | Overlap-analyse & "beste periode" | ✅ |
| P1.2.4 | Bevestiging → trip-data | ✅ |

### P1.3 Kosten splitten — ⬆️ door upstream-port grotendeels binnen
Upstream #1106 ("rework Budget into Costs — Splitwise-style, multi-currency,
mobile") dekt dit epic nu af. Controleer de details tegen je eigen acceptatie-
criteria, maar de basis staat:
| # | Feature | Status |
|---|---------|--------|
| P1.3.1 | Uitgave toevoegen (split types, categorieën) | ✅ ⬆️ (bonnetje-upload verifiëren) |
| P1.3.2 | Balansoverzicht per persoon | ✅ ⬆️ |
| P1.3.3 | Settle-up flow (debt simplification) | ⚠️ ⬆️ basis aanwezig; Tikkie-deeplink ❌ |
| P1.3.4 | Uitgaven-tijdlijn met filters | ✅ ⬆️ |

### P1.4 Groepschat & beslissingen — grootste open gat in P1
| # | Feature | Status |
|---|---------|--------|
| P1.4.1 | Threaded discussies (@mentions, replies, reacties) | ❌ |
| P1.4.2 | Contextuele links (bespreek-knop op poll/expense) | ❌ |
| P1.4.3 | Beslissings-samenvattingen ("Besloten"-badge) | ❌ |
| P1.4.4 | "Ping"-notificaties naar inactieve leden | ✅ |

### P1.5 Groepsmanagement & delen — af
| # | Feature | Status |
|---|---------|--------|
| P1.5.1 | Uitnodigen via link (tokens, intrekbaar, rechten) | ✅ |
| P1.5.2 | Rollen (owner/admin/member/guest) | ✅ |
| P1.5.3 | Openbare trip delen (read-only, privacy van notities) | ✅ + iframe-embed ✅ |

---

## Explore Marketplace (P2-sectie roadmap)

De roadmap-statuskolom (mei) is verouderd — veel is sindsdien gebouwd:

| Epic | Feature | Status |
|------|---------|--------|
| P2.1 | Creator-aanvraag + admin-goedkeuring | ✅ server (moderatie-endpoints, auto-approve) · 🔌 CreatorApplicationQueue-UI nog niet in nieuwe AdminPage |
| P2.1.3 | KYC & Wise-uitbetalingen | ❌ |
| P2.2 | Publicatie-flow + moderatie + versie-updates | ✅ PublishModal/Update · 🔌 publish-knop in nieuwe TripPlanner ✅, Dashboard-publish 🔌 |
| P2.3 | Browse-pagina + blur-preview + koopknop | ✅ |
| P2.4.1 | Mollie payment flow + webhook | ✅ (confirmation-page basis) |
| P2.4.2 | Trip-import als fork (ID-remapping, badge) | ✅ |
| P2.5.1 | Delta-tracking (explore_fork_deltas) | ✅ (tabel + deltaTrackingService bestaan, anders dan roadmap zegt) |
| P2.5.2 | Update-detectie & sync | ⚠️ sync + notificatie bestaan; diff-viewer/conflictdetectie ❌ |
| P2.6.1 | Commissie-configuratie | ✅ platform-fee + mollie-fees admin-API · 🔌 admin-UI |
| P2.6.2 | Creator earnings dashboard | ✅ endpoint + EarningsOverview/DetailModal componenten |
| P2.6.3 | Maandelijkse payout-batch | ⚠️ payouts-tabel + handmatige registratie ✅; Wise/cron/batch ❌ |
| P2.6.4 | Platform-financials (admin) | ❌ |
| P2.7 | Reviews & ratings | ✅ tabellen + endpoints + ReviewForm/ReviewsList (anders dan roadmap zegt); "helpful"-stemmen verifiëren |
| P2.8.1 | Creator public storefront (slug-pagina) | ✅ CreatorStorefrontPage + /creators/:slug |
| P2.8.2 | Badge-systeem | ✅ badgeService (verified/top-seller/trending/…) |
| P2.8.3 | Storefront-customization | ⚠️ CreatorProfileEditor bestaat; featured-selector/image-resize ❌ |
| P2.8.4 | Creator analytics | ⚠️ visitor insights (referrer/UTM/poll) ✅ · 🔌 VisitorInsightsPanel-UI; conversie-tracking ❌ |

---

## Creator Hub (trek-creator-hub-spec.md)

| Epic | Feature | Status |
|------|---------|--------|
| 1.1 | Link-in-Bio builder (blokken, preview) | ✅ LiBEditor/LiBBlockEditor/LiBPreview + publieke route |
| 1.2 | LiB thema's & styling | ✅ LiBThemes + lib-themes.css |
| 1.3 | Custom domein | ❌ |
| 2.1 | Social content importeren (IG/TikTok) | ❌ |
| 2.2 | "Koop deze reis"-overlay op content | ❌ |
| 3.1 | Affiliate link management | ✅ AffiliateManager + /public/go redirects |
| 3.2 | Affiliate statistieken (clicks) | ⚠️ click-tracking basis; dashboard beperkt |
| 3.3 | Tip jar (donaties) | ✅ tips-router + Mollie |
| 4 | Media kit generator | ❌ |
| 5.1 | Branded mini-guides | ❌ |
| 5.2 | E-mail subscriber lijst | ❌ |
| 6 | Group trip hosting (publieke groepsreis + aanmelding/betaling) | ❌ |
| 7 | Audience analytics gecombineerd dashboard | ⚠️ losse stukken (visits, affiliates, earnings); combinatie ❌ |
| 8 | Content planner & scheduling | ❌ |

---

> **World Map verwijderd** (2026-06-13): de collaboratieve wereldkaart is eruit;
> de personal per-land bucket-list in Atlas vervangt het concept.

## Groep als clubhuis (Groep als clubhuis.md + Group-check.md)

| Feature | Status | Inschatting (uit Group-check) |
|---------|--------|-------------------------------|
| Groepsfoto/cover + beschrijving | ✅ | — |
| Stemrondes | ✅ GroupPolls | — |
| Statistieken (reizen/landen/dagen samen) | ✅ `/groups/:id/stats` endpoint | — |
| Groepskaart (bezochte bestemmingen) | ✅ GroupMap-component | — |
| Prikbord / ideeënlijst | ✅ group_ideas CRUD | — |
| WhatsApp-export van uitslag | ✅ wa.me-share in GroupsPage | — |
| Reisarchief-tijdlijn | ⚠️ data aanwezig, weergave verifiëren | klein |
| "Wie gaat er mee?"-knop vanuit groepsoverzicht | ⚠️ participants-tabel bestaat; sneltoets-UI verifiëren | klein |
| Beschikbaarheidsdrempel-notificatie | ✅ date_proposal_threshold_reached event | — |
| Groepskleur/thema | ❌ | 1–3 dagen |
| Gedeelde taakverdeling (group-scoped todo's) | ❌ | 1–3 dagen |
| Activiteitenfeed | ❌ | zwaar |
| Groepsmijlpalen ("5e reis samen!") | ❌ | zwaar/laag |

---

## P2 — Nice to have (roadmap)

| # | Feature | Status |
|---|---------|--------|
| P2.1.1–3 | POI discovery op kaart (puntjes, zoeken, map-to-day) | ✅ ⬆️ upstream #1147 (POI-pill + instance-wide Mapbox) |
| Bucket-list per land | Mooie plekken bewaren per land (Atlas), opduikend bij trip-planning | ✅ bucket_list (Atlas) + trip-suggesties op basis van het land van je places |
| P2.1.4 | Zoeken langs route | ❌ |
| P2.1.5 | PWA GPS-suggesties | ❌ |
| P2.2.1 | Drag & drop hele dagen + dag invoegen | ✅ ⬆️ upstream #1148 |
| P2.2.2 | Alternatieve opties ("2a/2b") | ❌ |
| P2.2.3 | Sub-posities (taken nesten) | ❌ |
| P2.2.4 | Week-/maandweergave | ❌ |
| P2.2.5 | Favorieten/wishlist | ⚠️ place votes (👍/👎) ✅; echte wishlist ❌ |
| P2.3.1 | Groeps-paklijsten met eigenaarschap | ⚠️ packing-leden-toewijzing per categorie ✅; group-scoped ❌ |
| P2.3.2 | Privé paklijsten | ❌ |
| P2.3.3 | Eigen foto's aan plaatsen | ✅ (photo-upload endpoints, via forkExtras) |
| P2.4.1 | Budget-checkbox per activiteit | ✅ ⬆️ place-prijzen → Costs |
| P2.4.2 | Multi-valuta budget | ✅ ⬆️ Costs-rework |
| P2.4.3 | Live valutaconversie | ✅ ⬆️ exchangeRateService |

---

## P3 — Geparkeerd

| Epic | Status |
|------|--------|
| P3.1 Trip rewind & gamification (quiz, awards, persona's, bingo) | ❌ |
| P3.2 Statistieken (km-teller, CO2, hoogte, tijdverdeling) | ⚠️ landen/steden-tellers + travel-stats (afstand) ✅ ⬆️ dashboard-widgets; rest ❌ |
| P3.3 Achievements & retentie (kraslot-kaart, streaks, share-card) | ⚠️ Atlas world-map ✅ (≈ kraslot); rest ❌ |
| P3.4 Creator marketplace | → zie Explore-sectie hierboven (grotendeels ✅) |
| P3.5 Vacay-uitbreidingen | ✅ uren/halve dagen/TvT ✅; lokale kalenders ⚠️ (holiday_calendars bestaat) |
| P3.6 GPX kleur/route-onderdeel | ⚠️ GPX-tracks + stats ✅; kleurkeuze ❌ |

---

## Agency / B2B (trek-agency-spec.md) — volledig toekomstwerk

Relevant vanwege `Possible customers.md` (NL maatwerk-touroperators als doelgroep).
Niets hiervan is gebouwd, behalve de bouwstenen:

| Epic | Status |
|------|--------|
| 1. Agency account & team (multi-tenant) | ❌ |
| 2. White-label branding | ⚠️ instance-branding (logo/kleuren/naam via admin) ✅ — per-agency ❌ |
| 3. Klantenbeheer (CRM) | ❌ |
| 4. Itinerary builder & templates | ⚠️ planner + trip-clone/copy ✅ als basis; template-bibliotheek ❌ |
| 5. Offertes & voorstellen | ❌ (PDF-export van trips ✅ als bouwsteen) |
| 6. Boekingen & documenten | ⚠️ reserveringen + KItinerary booking-import ✅ ⬆️; agency-flow ❌ |
| 7. Klantportaal & reisbegeleiding | ⚠️ publieke share-links + embed ✅ als basis; portaal ❌ |
| 8. Financiën & commissies | ❌ |
| 9. Rapportage & analytics | ❌ |
| 10. Subscription & onboarding | ❌ |

---

## Aanbevolen volgorde (relevantie × moeite)

1. **Port-restwerk afmaken** (`PORT_STATUS.md`) — alles met 🔌: bestaande,
   werkende features weer zichtbaar maken (admin-tabs, dashboard-publish,
   visitor-poll, unsplash-picker). Hoogste waarde per uur.
2. **P1.4 Groepschat & beslissingen** — enige echt ontbrekende P1-epic;
   maakt het groeps-verhaal compleet.
3. **P1.3 verifiëren/afronden** — upstream Costs naast je eigen
   acceptatiecriteria leggen (bonnetjes, Tikkie-link, settle-bevestiging).
4. **Clubhuis-kleintjes** — groepskleur, gedeelde taakverdeling,
   reisarchief-weergave: weinig werk, direct voelbaar voor vriendengroepen.
5. **Explore afronden voor beta** — moderatie-UI (🔌), payout-batch,
   platform-financials; daarna reviews-helpful en sync-diff-viewer.
6. **Creator Hub fase 2** — media kit, mini-guides, subscribers (pas als er
   echte creators zijn).
7. **P2 planning-UX** — alternatieve opties, week-weergave, wishlist.
8. **P3 gamification/statistieken** — leuk, lage urgentie.
9. **Agency/B2B** — groot apart traject; pas starten met een concrete
   pilot-klant uit `Possible customers.md` (beste eerste kandidaten:
   From A to Everywhere, Reiswijf, Rondreiskenner — klein en wendbaar).
