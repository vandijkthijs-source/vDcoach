# Huidige schermindeling — 2.0.11

Coach is de eerste tab en het startscherm: een zwerm van 480 boids-deeltjes die tijdens praten compacter wordt, een korte introductie en een gesprek met vaste invoerbalk. Het volledige dagoverzicht staat achter het agenda-icoon. Daarna volgen Agenda en Richting. Historie, taken, timer, sollicitaties en de bestaande serverkoppeling blijven behouden. Een planvoorstel wordt pas na bevestiging opgeslagen.

Versie 2.0.11 / Android-code 31. Geen APK gebouwd. Zie [ChatGPT in de app](CHATGPT-IN-APP.md) voor de volledige werking en controlegrenzen.

---

# vDcoach 2.0 — geïntegreerde release

De actieve bron staat uitsluitend in `/home/thijs/Projects/vDcoach`. De productieserver blijft op `vd-server` / `100.118.124.29`. Er is geen nieuwe productieserver of tunnel gemaakt. De gebruiker bouwt zelf de APK.

## Gebruik

- **Vandaag:** één passende volgende actie, maximaal drie belangrijke taken, compacte feiten, aankomende afspraken en gewoontes. Overige taken blijven inklapbaar bereikbaar. Een afgesloten dag krijgt een expliciete bewaard-status.
- **Ik loop vast:** bewerkbare eerste stap en een focusblok van vijf minuten. Dit maakt geen duplicaattaak en verandert de oorspronkelijke taakduur niet.
- **Focus:** Start / Pauze / Verder / Stop. Gestopte tijd wordt dagboekregistratie; alleen een afzonderlijke expliciete afronding voltooit de taak. De native timer blijft duurzaam buiten de app bewaard.
- **Herplan:** gratis deterministisch voorstel rond agenda, deadlines, projectdeadlines, energie en beschikbare tijd. Pas na bevestiging ontstaan geplande blokken. Nieuwe afspraken of een verouderd voorstel blokkeren ongeldige bevestiging.
- **Status:** te doen, ingepland (afgeleid uit bevestigd blok), wachten, geparkeerd en afgerond. Wachtende/geparkeerde taken worden niet steeds aanbevolen. Een bevestigde waitingUntil kan ze weer relevant maken.
- **Even kiezen:** onverwerkte open taken uit gesloten dagen. Een keuze voor vandaag of backlog maakt een gekoppelde taak met hetzelfde ID; de oorspronkelijke gesloten dag blijft intact. Toekomstige, verwijderde of later afgeronde versies komen niet opnieuw terug.
- **Richting:** projecten en hun volgende stap, domein, deadline, backlog en de bestaande sollicitaties. Werk, thuis, gezondheid, voeding, sociaal en ontwikkeling zijn optionele labels; er worden geen persoonlijke doelen afgeleid of medische conclusies getrokken.
- **Voeding:** alleen optionele vrije tekst onder Jouw leven; geen afzonderlijke tab, verplichtingen of dubbele registratie. Oude voedselhistorie blijft behouden.
- **Dagboek:** bestaande agenda, slepen, activiteiten en timer blijven. De afsluiting toont bevestigde feiten en een optionele notitie.

## Eén dagcyclus

De app leest de server bij openen, hervatten en actief iedere minuut, en synchroniseert na lokale wijzigingen. Zonder netwerk blijven registratie, focus, taakkeuzes en herplanning beschikbaar. Zonder ochtendplan meldt de app expliciet dat externe bronnen niet opnieuw gecontroleerd zijn; oude afspraken worden niet gekopieerd als nieuwe afspraken.

Na lokale middernacht sluiten app en server afgelopen dagen zonder iets af te vinken of alles naar morgen te schuiven. De feitelijke dagterugblik is direct beschikbaar. De inhoudelijke AI-review draait via de bestaande ChatGPT-ochtendtaak om 07:00, met exacte inputHash, bronrevisies en idempotente dagboekmarkering. Late offline invoer zet de dag opnieuw in de reviewwachtrij.

De dagregisseur op de server gebruikt **gegenereerde code uit dezelfde TypeScript als de app**. `npm test` genereert die motor vooraf; `npm run director:build` kan afzonderlijk. Android-widgets behouden een native offline planner. Houd hun focusfilters en grensgevallen bij verdere wijzigingen gelijk.

## Widgets en achtergrond

De grote widget heet **Dagcoach 2.0 · volledig scherm**. De bestaande provider-ID blijft behouden, met 3×3 startmaat en vergroten tot volledige pagina. De vier bestaande stijlen blijven werken. Bij pakketupdate en herstart worden widgets opnieuw getekend. Tik op de focustitel voor de kleine-start-popup.

De native outbox verstuurt expliciete widgetacties en gestopte timers via `/widget-events`. De server verwerkt deze atomair met dezelfde reducers als de app en een afzonderlijk duurzaam ontvangstlog. Herhaling maakt geen dubbele taak of activiteit. De lokale inbox en timers blijven bewaard tot de app ze importeert; een serverontvangst verwijdert geen lokale broninvoer. Android JobScheduler plant achtergrondverversing ongeveer iedere 15 minuten en vraagt na invoer eerder uitvoering. Doze, batterijbeperkingen, geforceerd stoppen en Tailscale-bereikbaarheid kunnen dit vertragen; dit is geen seconde-precieze garantie.

## Herkenbare build en databehoud

Versie **2.0.0**, Android **versionCode 20**, ongewijzigd package `nl.vandijk.coach`, dezelfde signing key. Vandaag toont v2.0.0; Instellingen toont zowel JavaScript- als native Android-versie. Hiermee is een verkeerde of niet geïnstalleerde APK-update herkenbaar. De oorzaak op de niet-aangesloten telefoon is niet bewezen: de APK van 12 november 22:21 bevatte de vorige focusfuncties al; een afgesloten dag kon de focuskaart verbergen. Er is geen telefoonopslag gewist of app verwijderd.

Bouw uitsluitend zelf:

```bash
cd ~/Projects/vDcoach/android
./gradlew assembleRelease
```

De enige buildoutput is `android/app/build/outputs/apk/release/app-release.apk`. De oude losse kopie in outputs is verwijderd; er is geen automatische kopie of nieuwe buildmap toegevoegd. Installeer als update. Deze opdracht is tijdens de 2.0-ontwikkeling niet uitgevoerd.

De opslagsleutel `vdcoach-v1` en dataschema version 1 blijven bewust compatibel. Voor de eerste succesvolle 2.0-inlezing bewaart de app de oorspronkelijke bytes als `vdcoach-before-v2`. Bestaande herstelkopieën, geschiedenis, serverinstellingen en beveiligde token blijven behouden. Een onleesbare invoer of mislukte back-up wordt nooit vervangen door een lege dag.

## Controle en terugrollen

Vooraf zijn volledige bron- en sleutelback-ups lokaal gemaakt onder `~/Documents/ChatGPT/VdCoach/release-backups/before-2.0-20261112-225053` en een consistente, integrity_check-gecontroleerde database plus bronarchief op de server onder `server/fix-backups/before-2.0-20261112-225143`. Database en bronarchief op de server hebben privé-rechten. Tokens en credentialbestanden zijn niet in het nieuwe bronarchief opgenomen.

Rol bij codeproblemen bronbestanden terug uit het bronarchief, behoud de actuele database en invoer. De schema-uitbreiding is additief (`event_receipts`); geen bestaande tabel is verwijderd. Een database-terugzetting is alleen een herstelmiddel bij daadwerkelijk dataverlies: maak eerst een actuele snapshot en behoud nieuwe offline invoer. De oude APK heeft een lager versionCode: Android-downgrade is geen standaard terugrolpad en mag niet via uninstall of datawissen worden afgedwongen. Gebruik zo nodig de vorige bron met een hoger versionCode en dezelfde signing key als herstelupdate.

Een bestaande systemd-259 credential-opstartbotsing is opgelost door de **zelfde** tunnelunit met een schone canonical naam `vdcoach-connection.service` te starten; `vdcoach-tunnel.service` blijft alias. Bestaande sleutel, profiel, LoadCredentialEncrypted, NoNewPrivileges, PrivateTmp, ProtectSystem en ProtectHome zijn ongewijzigd. Start nooit beide als aparte processen. De oorspronkelijke unit is in de serverherstelkopie bewaard.

## Acceptatiebewijs

Geautomatiseerd gecontroleerd: offline fallback, kiezen/parkeren zonder historische mutatie, wachtende taken, deadlines/agenda/energie, oorspronkelijke opslagkopie, sync-conflicten en late invoer, timer en middernacht/DST, outbox-retries zonder duplicaten, volledige MCP-reviewcyclus met hash en retries, ondersteunde RemoteViews-layouts en Kotlin-compilatie. Visueel getest in geïsoleerde webpreview met voorbeeldgegevens: versie, kleine start, pauze, stop zonder taakafronding, status wachten, terugvinden van de taak en de nieuwe cockpit.

De productieserver is lezend gecontroleerd op release, motor, reviewwachtrij en behoud van dagen/revisie. ChatGPT toont de herstelde reviewtools. Er is geen productiedag als test voltooid en geen echte agenda of mail gewijzigd.

Niet fysiek gecontroleerd: de nieuwe release op een Samsung, widgetinflatie op One UI, achtergrondgedrag onder Samsung-batterijbeheer en een echte APK-update met databehoud. Geen telefoon of emulator was aangesloten en er is op uitdrukkelijk verzoek geen APK gebouwd. De eerstvolgende automatische 07:00-run is nog geen geobserveerd testresultaat.
