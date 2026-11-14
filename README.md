# vDcoach 2.0.11

Persoonlijke Android-coach met je eigen server als gegevensbron. Dagplan, voortgang, agenda en sollicitaties blijven samen bewaard.

- **Coach:** ChatGPT-gesprek met vaste invoerbalk, compacte dagintro en een zwerm van 480 boids-deeltjes die op typen en antwoordtekst reageert. Planwijzigingen worden pas na bevestiging opgeslagen.
- **Agenda:** tijdlijn, activiteiten, focus en de bestaande activiteitentimer.
- **Richting:** sollicitaties, automatisch gegroepeerd op groen, oranje en rood, ook na lokale wijzigingen.

Instellingen staan onder het tandwiel. Dagdetails, gewoontes en eerdere dagen blijven via het agenda-icoon in Coach bereikbaar. Bestaande historie en de serverkoppeling blijven behouden.

## Zelf een APK bouwen

De actieve checkout staat in `~/Projects/vDcoach`. Gebruik Java 17, de bestaande Android SDK en de bestaande lokale signing key. De key is niet opgenomen in Git: bewaar hem bij het bijwerken of verplaatsen van de checkout, zodat je de app als update kunt installeren.

```bash
cd ~/Projects/vDcoach
npm ci
cd android
./gradlew assembleRelease
```

Uitvoer: `android/app/build/outputs/apk/release/app-release.apk`.

De Android-bronnen bevatten eigen modules voor de widgets, timer, aanmelding en Canvas-zwerm. Regenereer ze niet met Expo prebuild. Er wordt geen APK naar deze repository gekopieerd.

## Server en ChatGPT

Gebruik de bestaande productieserver (`vd-server`); start geen tweede productieomgeving op de bouwlaptop. Stel de verbinding in via het tandwiel. Telefoontokens blijven in Android SecureStore; OAuth-gegevens en persoonlijke serverdata staan buiten Git.

Verbind ChatGPT eenmalig vanuit de app. Deze route gebruikt je beschikbare abonnementsruimte, zonder losse inference-API-sleutel of betaalde terugval. Controleer zelf bij ChatGPT Gebruik dat extra credits uitstaan: de app kan die accountinstelling niet uitlezen of afdwingen.

De bestaande ochtendautomatisering vult het dagplan. Het gesprek gebruikt opgeslagen servergegevens en heeft niet automatisch toegang tot bestaande ChatGPT-chats, geheugen, Gmail of Google Agenda. Het kan eigen agendablokken en taken ter bevestiging klaarzetten; het voert geen Linux-systeembeheer uit. Historie en offline invoer blijven behouden.

## Documentatie

- [Huidige werking, dagcyclus en release](docs/VDCOACH-2.0.md)
- [ChatGPT-aanmelding, gesprek en animatie](docs/CHATGPT-IN-APP.md)
- [Ontwikkel- en bouwoverdracht](docs/BUILD-LAPTOP-HANDOFF.md)
- [App/serverkoppeling](server/APP-UPDATE.md)
- [Controles voor 2.0.11](docs/RELEASE-2.0.11-CHECKS.json)
- [Historische handleiding](docs/README-LEGACY.md)

## Controle

```bash
npm test
npm run typecheck
python3 -m unittest discover -s server -p 'test_*.py'
node --test server/test_mcp.mjs
```

Voor deze update slagen 179 app-tests, 57 servertests en de MCP-integratietest. De Android-compilatie is eerder voor dezelfde appbron geslaagd; er is geen APK gebouwd. De nieuwe toetsenbordindeling is met een geïsoleerd ontwerpgesprek gecontroleerd, maar nog niet fysiek op de telefoon getest. Installeer als update; verwijder of wis de bestaande appgegevens niet.
