> Actuele versie: **1.2.1** — servergestuurde synchronisatie en veilig opstartherstel.
> Bouw op de ontwikkellaptop; deze Latitude is de productieserver.
> Zie [overdracht voor de bouwlaptop](docs/BUILD-LAPTOP-HANDOFF.md) en
> [appkoppeling](server/APP-UPDATE.md). Oudere beschrijvingen hieronder bevatten
> historische UI- en overdrachtsflows; de huidige app gebruikt server-synchronisatie.

# vDcoach — ochtendoverzicht

Nederlandse Android-app met vier tabs:
- **Vandaag**: automatisch aangeleverd ochtendoverzicht, maximaal drie prioriteiten, volledige checklist en ingeklapte broninformatie.
- **Dagboek**: agendaweergave met tijdkolom en afspraakblokken. Via + voeg je titel, datum, begin- en eindtijd (of hele dag), locatie en beschrijving toe. Tik op een activiteit om te bewerken of verwijderen. De lijstweergave behoudt de versleepbare volgorde. Wijzigingen blijven lokaal en veranderen Google Agenda niet. Geplande afspraken pas afvinken na uitvoering. Oude notities blijven als dagboekregel bewaard.
- **Voeding**: losse tekstregels toevoegen met Enter; de coach schat kcal en macro’s bij de dagafsluiting.
- **Instellingen**: laptopverbinding, vorige dagen en back-upexport.

De ochtendtaak draait dagelijks om 07:00 Europe/Amsterdam in deze desktopchat. De desktopapp moet blijven draaien en de gekoppelde Google-apps moeten beschikbaar blijven. De bestaande ChatGPT-webochtendtaak is niet automatisch gewijzigd of uitgezet; voorkom later dubbele ochtendtaken door die zelf te pauzeren zodra de nieuwe run goed werkt. Geen API key of betaalde dienst wordt gebruikt. Abonnementsgrenzen blijven gelden.

## Android bouwen

Geen APK is gemaakt. De actuele bron staat in `/home/thijs/Documents/ChatGPT/VdCoach` en wordt ook naar `/home/thijs/Projects/vDcoach` gekopieerd.

```bash
cd /home/thijs/Projects/vDcoach/android
./gradlew assembleRelease
```

Deze checkout heeft een eigen dependency-installatie volgens package-lock.json. Gebruik `npm ci` om deze opnieuw te installeren. Persoonlijke release gebruikt de bestaande ontwikkelsleutel. Native clipboard zit in Android-bronnen: regenereer Android niet met Expo prebuild.

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

Dagboek-tijdlijn: 06:00–00:00 met blokken op werkelijke duur. Tik een tijdslot voor een leeg uurblok, versleep de boven-/ondergreep in kwartieren en vul titel/tijden in via het paneel eronder. Tijd kiezen gebeurt via een 24-uursklok (uur en dan minuut), ook bij bewerken. Overlappende afspraken staan naast elkaar. Alles wordt lokaal opgeslagen.

Activiteiten verplaatsen: houd een tijdblok circa een halve seconde ingedrukt en sleep omhoog/omlaag. De duur blijft behouden, tijden schuiven in kwartieren en blijven tussen 06:00 en 00:00. Kort aantikken opent het compacte venster met titel en klokvelden; datum, locatie, beschrijving en uitgevoerd worden daarin niet getoond. Bestaande gegevens blijven bewaard.

## Activiteitentimer
De vaste merk-/datumbalk is vervangen door een uitklapbare timerkaart. Voer een titel in en start; stoppen maakt een uitgevoerde activiteit in het lokale Dagboek met begin- en eindtijd. De echte looptijd en timestamps blijven bewaard; het agenda-raster toont hele minuten. Over middernacht wordt de registratie over de betreffende Amsterdam-dagen verdeeld.

Android gebruikt een native foreground service (specialUse), een blijvende chronometermelding en de actie ‘Stop en bewaar’. Wegvegen van de app uit Recente apps stopt de timer niet. Zowel de actieve starttijd als gestopte registraties worden in native opslag vastgelegd. Bij stoppen vanuit de melding terwijl de app dicht is, wordt de registratie bij de volgende opening geïmporteerd, zonder dubbelen. Pas na succesvolle opslag in het dagboek wordt de native wachtrij bevestigd. Geen Google Agenda- of Drive-writes.

Meldingen moeten bij de eerste start worden toegestaan. Live Update-promotie wordt aangevraagd voor een chip/statusweergave op ondersteunde Android/Samsung-versies; daadwerkelijke plaatsing in de Samsung Now Bar hangt af van toestel, One UI en systeeminstellingen. Een geforceerde stop door Android kan een appservice beëindigen; de opgeslagen begintijd blijft behouden. Browser-preview heeft alleen een opgeslagen timer, geen Android-melding.

Native controle zonder APK: de timerbron is afzonderlijk met de lokale Kotlin-compiler tegen Android 36 en de bestaande AndroidX/React-klassen gecompileerd. De foregroundmelding/Now Bar moet nog op een fysieke Samsung worden gecontroleerd. Bouw zelf de release met `./gradlew assembleRelease` in android/.

Voeding toont compacte kaartjes met iconen en behoudt vrije tekstinvoer met Enter. Tikken op het invoerveld opent eerder ingevoerde voedingsregels, meest recent eerst en zonder dubbele suggesties. Drie regels zijn zichtbaar; de overige staan in een apart scrollbare lijst. Tik een suggestie om de tekst over te nemen en eventueel aan te passen; Enter of + voegt hem toe. Alleen bestaande invoeren worden gebruikt, geen verzonnen maaltijden of automatische voedingsschattingen.

Bij elk recent voedingsitem staat een kruisje om alleen die suggestie uit de historie te halen. Dit blijft na herstart en in back-ups bewaard en verwijdert geen dagregistraties. Wanneer je dezelfde voeding later zelf opnieuw toevoegt, verschijnt die weer als recente invoer. Herkenbare voeding krijgt een passend symbool; onbekende invoer gebruikt het neutrale bestekicoon.

Vandaag toont korte taaktitels met uitklapbare volledige opdrachten. Maximaal drie open prioriteiten staan bovenaan met een subtiel blauw accent; overige taken volgen daaronder. Duur, expliciete deadline en doorschuifteller staan op één compacte regel. Afgeronde taken staan standaard ingeklapt onder ‘Afgerond · aantal’. Vegen naar morgen/verwijderen en de volledige avondoverdracht blijven werken. Dagplannen ondersteunen optioneel shortTitle en dueDate; oude plannen blijven bruikbaar zonder gegevensverlies.

Uitgeklapte taken hebben een vrij opmerkingenveld dat automatisch lokaal wordt bewaard. Opmerkingen gaan mee naar morgen en naar de gekopieerde dagstatus. Swipe rechts verplaatst naar morgen; swipe links verwijdert. Vanaf deze versie worden verwijderde taken met hun volledige tekst en opmerking bewaard in een daglogboek voor ‘Verwijderd uit de daglijst’ in de avondoverdracht. Dat is geen afronding en geen automatische Drive-wijziging. Oude verwijderingen zonder bewaarde taaktekst worden niet achteraf verzonnen. Tijdens typen in de opmerking is vegen tijdelijk uitgeschakeld om onbedoeld verwijderen te voorkomen.

Voedingsregels zijn direct bewerkbaar door op de tekst te tikken. Opslaan of Enter wijzigt dezelfde regel op dezelfde plaats, zonder een extra maaltijd toe te voegen; Annuleren bewaart de oorspronkelijke invoer. De timerkaart blijft na starten open, leegt het titelveld en biedt ruimte om de volgende activiteit alvast te typen. Stoppen bewaart de lopende activiteit onder de oorspronkelijke titel en laat die volgende titel staan voor de volgende start.


### Android-startschermwidgets
- Taken 2×3: scrollbare lijst met gewone taken, open prioriteiten eerst. Tik een taak om af te vinken; via ＋ Toevoegen maak je in een klein native typvenster een nieuwe taak. Die verschijnt direct in de widget, kan meteen worden afgevinkt en wordt bij synchronisatie zonder dubbelen overgenomen in Vandaag. Gewoontes blijven in de app. Afgesloten dagen laten geen toevoegingen toe. Titel opent de app.
- Voeding 2×2: aantal regels en laatst toegevoegde voeding. Tik Toevoegen voor een klein tekstvenster; Enter/Toevoegen bewaart een vrije tekstregel en leegt het veld voor de volgende. Annuleren sluit het venster.
- Activiteit 4×1: tik op Activiteit typen… of Start om meteen een klein native invoervenster te openen, zonder de volledige React-app. Android RemoteViews ondersteunt geen EditText ín een startschermwidget. Start in het typvenster keert terug naar de widget; die toont de titel, een lopende chronometer en Stop. Vóór starten staat de klok op 00:00. Stop bewaart de activiteit voor Dagboek. Gebruikt dezelfde notificatie, timer en voltooiingswachtrij als de app.
Na installatie eenmaal de app openen, daarna lang drukken op het startscherm → Widgets → vDcoach. De opgegeven standaardmaten volgen Android-gridcellen; de launcher bepaalt de uiteindelijke afmetingen. Widgets zijn vergroot/verkleinbaar. Kleuren volgen de laatst opgeslagen dark-modevoorkeur.
Widgets tonen de laatst gesynchroniseerde lokale appstatus; ze halen zelf geen laptop- of Drive-plan op. Voedingsinvoer en vinkjes werken zonder React actief en blijven bewaard in een private native wachtrij. Bij openen van de app (of binnen twee seconden terwijl die actief is) worden acties op hun oorspronkelijke Amsterdam-datum geïmporteerd. Actie-ID's voorkomen herhaling; pas na succesvolle opslag van de appstatus wordt de native wachtrij bevestigd. Afgesloten dagen worden niet gewijzigd. Native afgeronde timers worden op dezelfde manier als bestaande timers geïmporteerd bij het openen van de app.
Geen extra diensten, API's of abonnementen. Native widgetinstallatie en launcherweergave moeten nog op een fysieke Samsung worden gecontroleerd; Kotlin-compilatie, Android-resourcevalidatie en synchronisatietests zijn zonder APK-build uitgevoerd.

Widgetuitbreiding 1 november 2026: taken toevoegen wordt ook getest op offline toevoegen plus afvinken, opnieuw importeren, back-upherstel, afgesloten dagen en titelvalidatie. Native invoer en launcherweergave moeten op een fysieke telefoon worden gecontroleerd; geen APK of telefooninstallatie uitgevoerd.


### Sollicitaties en instellingen
De onderste navigatie heeft Vandaag, Dagboek, Voeding en Sollicitaties. Instellingen opent als apart venster via het tandwiel rechtsboven. Alle bestaande instellingen en vorige dagen blijven daar beschikbaar.
De Sollicitaties-tab toont de nieuwste gecontroleerde `applications`-momentopname uit de ochtendplannen: actie nodig, gesprek gepland en wachten op reactie. Kaarten klappen open voor vervolgstap, actiedatum, gesprekstijd en bronlink. Gesloten/afgewezen trajecten en losse vacatureverkenningen horen niet in deze momentopname. Een oriënterend contact of conceptaanvraag wordt expliciet zo benoemd. Een actiedatum is geen afspraak of deadline.
De nieuwe sollicitatiewidget is standaard 2×3 en kan worden vergroot. Hij toont dezelfde scrollbare lijst uit de lokale appstatus. Tik op een kaart of titel om de Sollicitaties-tab te openen. Open de app na installatie eenmaal om de widgets bij te werken.
De ochtendrun leest tracker en relevante mail en publiceert `applications: {updatedAt, items}` naast het dagplan. Een ontbrekende momentopname behoudt de vorige; een expliciete lege items-lijst wist het overzicht. Oudere dagplannen/back-ups blijven compatibel. Geen betaalde API of rechtstreekse externe schrijfacties vanuit app of widget.


### Compacte sollicitatiestatus en dagoverdracht
Sollicitaties verschijnen als compacte regels met een groen (positief/gesprek), oranje (lopend/actie) of rood (afgesloten) bolletje. Tik op een regel en kies Bijwerken om status, fase, kleur, vervolgstap, opmerking en actiedatum te wijzigen. Bij afsluiten worden status en vervolgstap op Afgesloten / Geen vervolgactie gezet; je kunt de tekst aanpassen. Afgesloten trajecten blijven onder een uitklapbaar archief, niet tussen actieve widgetregels.
Elke bewerking wordt lokaal met Update-ID en tijdstip bewaard in applicationJournal. Dagstatus kopiëren bevat het actuele overzicht én de wijzigingen van de gekozen dag, inclusief notities, bronlinks en bekende datums. Geef dit door aan de coach om op expliciet verzoek tracker/Drive bij te werken; de app schrijft die externe bronnen niet zelf.
Een ochtendplan overschrijft een lokale bewerking niet totdat applications.items.acknowledgedUpdateId exact de betreffende laatste Update-ID bevestigt. Na die bevestiging kunnen nieuwe gecontroleerde bronupdates weer worden gevolgd. Zonder bevestiging blijft de wijziging ook bij een lege/ontbrekende bronmomentopname behouden. De widget toont dezelfde samengevoegde appstatus.


### Sollicitaties terugkijken per dag
Korte kopjes splitsen de lijst in Actie nodig, Gesprekken en Wacht op reactie, met Afgesloten apart. De pijlen bij de datum gaan een kalenderdag terug/vooruit; tik op de datum om terug te keren naar vandaag. De datum van Sollicitaties is onafhankelijk van Vandaag/Dagboek. Toekomstige dagen zijn niet selecteerbaar.
Eerdere dagen tonen de laatst bekende opgeslagen momentopname tot en met die Amsterdam-dag, met alleen lokale wijzigingen die toen al waren vastgelegd. Nieuwe reacties of latere bevestigingen veranderen eerdere dagen niet achteraf. Eerdere dagen zijn alleen-lezen. Bij geen opgeslagen gegevens wordt geen historie verzonnen; de app toont een lege melding. Historie begint bij de eerste daadwerkelijk bewaarde sollicitatiemomentopname. Binnen dezelfde dag blijft de laatste opgeslagen bronversie leidend; er is geen archief van iedere verversing.
Dagstatus kopiëren voor een eerdere dag gebruikt dezelfde historische sollicitatiestand en het wijzigingslog van die dag.


### Sollicitaties toevoegen en verwijderen
Onder de lijst staat Sollicitatie toevoegen. Vul organisatie en functie in en kies status/fase; standaard is dit nog niet gesolliciteerd. Bij uitgeklapte bestaande regels staat Verwijderen naast Bijwerken. Na verwijderen kun je de laatste verwijdering ongedaan maken zolang je op dezelfde weergave blijft.
Toevoegingen, wijzigingen en verwijderingen worden met volledige inhoud en tijdstip in het lokale wijzigingslog bewaard. Verwijderen verbergt de regel uit app en widget en beschermt tegen terugzetten door oude brondata; eerdere dagen blijven de toenmalige stand tonen. Dit trekt geen sollicitatie in en verwijdert geen trackerhistorie. De dagoverdracht noemt de handeling expliciet en de ochtendprompt respecteert deze keuze.

## Bouwen op deze laptop

De actieve checkout is `/home/thijs/Projects/vDcoach`. Bouw zelf met:

```bash
cd ~/Projects/vDcoach/android
./gradlew assembleRelease
```

Gebruik Java 17 en de bestaande Android SDK; `android/local.properties` blijft lokaal. De oorspronkelijke signing key blijft behouden. Start op deze bouwlaptop geen productieserver of tunnel.
