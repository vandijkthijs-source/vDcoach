# vDcoach — ochtendoverzicht

Nederlandse Android-app met vier tabs:
- **Vandaag**: automatisch aangeleverd ochtendoverzicht, maximaal drie prioriteiten, volledige checklist en ingeklapte broninformatie.
- **Dagboek**: activiteiten toevoegen met Enter, afspraken uit de agenda en zichtbaar versleepbare volgorde via de greep rechts. Geplande afspraken pas afvinken na uitvoering. Oude notities blijven als dagboekregel bewaard.
- **Voeding**: losse tekstregels toevoegen met Enter; de coach schat kcal en macro’s bij de dagafsluiting.
- **Instellingen**: laptopverbinding, vorige dagen en back-upexport.

De ochtendtaak draait dagelijks om 07:00 Europe/Amsterdam in deze desktopchat. De desktopapp moet blijven draaien en de gekoppelde Google-apps moeten beschikbaar blijven. De bestaande ChatGPT-webochtendtaak is niet automatisch gewijzigd of uitgezet; voorkom later dubbele ochtendtaken door die zelf te pauzeren zodra de nieuwe run goed werkt. Geen API key of betaalde dienst wordt gebruikt. Abonnementsgrenzen blijven gelden.

## Android bouwen

Geen APK is gemaakt. De actuele bron staat in `/home/thijs/Documents/ChatGPT/VdCoach` en wordt ook naar `/home/thijs/Projects/vDcoach` gekopieerd.

```bash
cd /home/thijs/Projects/vDcoach/android
./gradlew assembleRelease
```

De aanwezige node_modules is een link naar de bestaande vDfotos-dependencies. Voor een onafhankelijke installatie: verwijder alleen die link en draai `npm ci` in de projectmap. Persoonlijke release gebruikt de bestaande ontwikkelsleutel. Native clipboard zit in Android-bronnen: regenereer Android niet met Expo prebuild.

## Verbinden

De laptopservice serveert op het Tailscale-adres `http://100.114.241.126:2285`. Tailscale moet actief zijn op telefoon en laptop. In Instellingen staat dit adres alvast klaar. Plak het token uit:
`/home/thijs/Documents/ChatGPT/VdCoach/server/data/token`
in het veld Verbindingstoken en druk op Verbinden. Token wordt in Android SecureStore bewaard, nooit in de broncode of export. Deel het niet.

Servicebesturing:
```bash
systemctl --user status vdcoach
systemctl --user restart vdcoach
```

De app haalt het nieuwste plan op bij openen/hervatten en elke minuut terwijl hij actief is. Geen Android-achtergrondtaak of pushgarantie. Zonder verbinding blijft het opgeslagen plan zichtbaar. Iedere dag krijgt een eigen datum; gisteren wordt nooit automatisch als vandaag getoond. Nog geen plan: duidelijke wachtstatus. Bronproblemen worden apart getoond; volledige agenda-check wordt niet aangenomen.

## Ochtendtaak

Alle bronregels en de uitvoerstructuur staan in `automation/ochtendrun.md`. Deze taak leest uitsluitend Calendar, Drive, Gmail en weer. Geen Google writes, bron-rollovers, e-mails of agenda-aanpassingen. Alleen het lokale app-uitvoerbestand wordt geschreven.

De taak maakt een gevalideerd JSON-bestand en publiceert dit atomair via:
```bash
python3 /home/thijs/Documents/ChatGPT/VdCoach/server/publish_plan.py /absoluut/pad/naar/plan.json
```

Service leest `server/data/plans/YYYY-MM-DD.json`; authenticatie is vereist. Ongeldige of ontbrekende plannen worden niet als geldige ochtendrun gepresenteerd. Publicatie overschrijft geen oudere dag en weigert een oudere versie. Er is geen automatische scraping van ChatGPT web of mailbox.

Bij verversen blijven lokale afvinkjes, voedingsinvoer en notities behouden. Taak-IDs blijven stabiel; ochtendplan mag niets afvinken. Zelf toegevoegde taken blijven staan. Taken die de bron uit een nieuwere volledige versie verwijdert verdwijnen uit de bronlijst; zelf toegevoegde taken niet. Maximaal drie prioriteiten uit de bron. Rollover wordt nooit automatisch opgehoogd.

## Dagafsluiting en gegevens

Afvinkjes, dagboekvolgorde en voeding blijven lokaal. Dagstatus kopiëren maakt een overzicht om met de coach te bespreken. Drive wordt pas door de coach bijgewerkt als je expliciet vraagt om de dag te verwerken. Afsluiten vergrendelt alleen de lokale dag; het bevestigt geen Drive-update.

Exporteer regelmatig een back-up via Instellingen. Oude v1-dagen worden behouden. Verwijderen van appgegevens wist lokale data. JSON-export bevat maaltijden, notities en afvinkjes maar geen verbindingstoken. De server kent daarnaast de eerdere `/backup`-route, maar voert geen automatische upload van privé-invoer uit.

## Verificatie

```bash
npm run typecheck
node tests/model.test.cjs
python3 server/test_plans.py
python3 server/test_server.py
npm run export:web
```

Eerste volledige Google-bronlezing en geïnstalleerde Android-app moeten nog afzonderlijk worden geverifieerd; tests publiceren alleen tijdelijke testdata. Nooit testtaken als echt dagoverzicht publiceren.

## Signing key on a fresh checkout

Android release builds currently use the local `android/app/debug.keystore`. It is deliberately excluded from GitHub. The original laptop keeps its existing file, so the usual Gradle command continues working there.

To update an app already installed on your phone, keep using the original local signing key. A new key produces a different signing identity. Do not commit signing keys to Git.

For a fresh personal installation from a new checkout, create a local development key before running Gradle:

```bash
keytool -genkeypair -v -keystore android/app/debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
```
