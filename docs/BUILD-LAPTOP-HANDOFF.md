# Overdracht aan de bouwlaptop — vDcoach 1.2.1

Plak onderstaande opdracht in Codex op de andere laptop:

---

Werk verder aan vDcoach vanuit GitHub: https://github.com/vandijkthijs-source/vDcoach, branch main. Lees eerst de repository-instructies en dit bestand. Deze laptop is de ontwikkel- en Android-bouwlaptop; de Latitude 7400 blijft de productieserver. Start hier geen tweede productieserver, Drive-backup of OpenAI-tunnel en kopieer geen productiedossiers of tokens naar de repository.

1. Zoek de bestaande checkout, waarschijnlijk `/home/thijs/Projects/vDcoach` of `/home/thijs/Documents/ChatGPT/VdCoach`. Controleer git status en remote voordat je wijzigt. Bewaar lokale wijzigingen en de oorspronkelijke `android/app/debug.keystore`; gebruik geen reset --hard, clean of nieuwe ondertekeningssleutel. Haal origin/main op en werk de geschikte checkout veilig bij. Gebruik bij conflicterende lokale wijzigingen een aparte checkout met behoud van de bestaande sleutel.
2. Controleer Node, dependencies, Java 17 en Android SDK/NDK. Op deze laptop zijn eerder Java 17, SDK `/home/thijs/Android/Sdk`, NDK `27.1.12297006` en werkende dependencies gevonden. In Projects/vDcoach was node_modules een symlink naar Projects/immich-sort/node_modules; vertrouw niet blind op die gedeelde installatie. Gebruik de lockfile voor een eigen installatie waar nodig. Stel JAVA_HOME/ANDROID_HOME en een genegeerde android/local.properties correct in.
3. Bouw de laatste broncode: versie 1.2.1, versionCode 4, pakket `nl.vandijk.coach`. De oorspronkelijke sleutel staat waarschijnlijk `/home/thijs/Projects/vDcoach/android/app/debug.keystore`. De bestaande APK op die laptop heeft certificaat SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Controleer dezelfde handtekening voor de update. Publiceer geen sleutel of wachtwoorden. Verwijder de bestaande telefoonapp niet.
4. Voer `npm run typecheck` en `npm test` uit. Bouw vanuit android met `./gradlew assembleRelease` (twee s'en in assemble). De gebruiker wil de APK zelf lokaal bouwen en overzetten; download of bouw niet opnieuw op de serverlaptop.
5. Onderzoek en controleer de opstartfix op de echte telefoon. Versie 1.2.0 toonde “Opgeslagen gegevens konden niet worden gelezen” en blokkeerde daarna op een vrijwel leeg scherm. De concrete exception/telefoonopslag is nog niet uitgelezen: beweer niet dat de precieze oorzaak al bewezen is. In 1.2.1 zijn daggegevens, sollicitatiecache en beveiligde verbinding apart geladen. `lib/startup.ts` archiveert de oorspronkelijke opslag vóór herstel van ongeldige planmetadata; taken, dagboek en voeding worden niet weggegooid. Onleesbare echte daggegevens geven een herstelscherm met originele export, opnieuw proberen en expliciet serverherstel. Geen automatisch leegmaken van opslag. Controleer zo nodig adb logcat met behoud van privacy; geen tokens of volledige dossiers in logs.
6. Installeer als update, behoud lokale invoer en controleer: openen/heropenen, bestaande data, dagplan, vijf huidige sollicitatieregistraties, dagboek toevoegen en herschikken, taak afvinken, offline wijziging en herverbinden, dag afsluiten en terugzien op serverdashboard. Gebruik echte input alleen met de gebruiker; maak geen fictieve persoonlijke voortgang in productie. Test transport met tijdelijke testdata waar mogelijk.

Architectuur en bestaand werk:
- Productieserver op Latitude: `http://100.118.124.29:2285` via Tailscale. Beide apparaten moeten verbonden zijn. Serverdashboard is alleen lokaal op die server: `http://127.0.0.1:2286/`, via de bestaande bureaubladsnelkoppeling.
- Server is de hoofdbron. App synchroniseert via GET/POST `/state` met revisions, driewegmerge en offline opslag; sollicitaties via `/applications`. Automatisch bij openen, hervatten, minuutpolling en kort na edits; dagafsluiting vraagt direct sync. Geen garantie op Android-achtergrondsync.
- Oude aparte planpoller, laptopbackupclient en handmatig kopiëren van dagstatus zijn verwijderd uit de appflow. Oude opslag- en SecureStore-sleutels blijven voor upgrades behouden.
- `lib/sync.ts`, `lib/sync-model.ts`, `lib/server-connection.ts`, `lib/coaching.ts`, `lib/startup.ts`, `app/index.tsx` bevatten de koppeling en herstelcode.
- Servercode, vernieuwd dashboard, bronverwijzingen, dossierstructuur, 14 MCP-tools en versleutelde Drive-backup staan onder server/. Runtimegegevens, sleutels, builds en APK's zijn genegeerd en horen niet in GitHub.
- De private ChatGPT-plugin kan serverdossiers ophalen. Dagelijkse ChatGPT-cloudtaak “vDcoach ochtendplan” is ingesteld om 07:00 Europe/Stockholm; eerste run is op 10 november 2026 geverifieerd. Geen nieuwe parallelle automatisering maken.
- De server bevat de Drive-mapstructuur en 51 geïmporteerde bestanden; Drive dient als versleutelde backup. Lees `server/OPERATIONS.md` en `server/APP-UPDATE.md` voor details. Laat deze infrastructuur op de serverlaptop staan.

Lever een lokaal gebouwde APK en korte validatiestatus op. Als de opstartfout blijft bestaan, zoek de concrete exception en herstel de oorzaak zonder lokale daggegevens te verwijderen. Commit en push eventuele nieuwe broncodefixes naar dezelfde repository; geen automatische force push.

---
