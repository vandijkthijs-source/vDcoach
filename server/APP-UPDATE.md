# Android 1.2.0 — serververbinding

De app gebruikt uitsluitend `/state` voor dagplannen en voortgang. De aparte
planpoller, handmatige dagstatusoverdracht en oude laptopbackupclient zijn weg.
Sollicitaties komen uit `/applications`; de laatst ontvangen versie blijft offline
zichtbaar. Nieuwe dagen bevatten geen lokaal bedachte gewoontes.

Bestaande lokale opslag en beveiligde verbindingstokens behouden hun sleutels bij
updaten. Eerste synchronisatie herkent oude onaangeraakte dagstandaarden, neemt
serverplanmetadata over en behoudt echte telefooninvoer. Conflicterende gelijktijdige
bewerkingen stoppen de upload en blijven lokaal bewaard. Exporteren blijft als
noodkopie beschikbaar in Instellingen.

Automatische synchronisatie: openen, terugkeren naar de app, iedere minuut zolang
de app actief is en 1,8 seconde na een wijziging. Afsluiten van de dag verstuurt
direct. Android achtergrondprocessen zijn geen gegarandeerde synchronisatie;
open de app met Tailscale ingeschakeld om offline invoer te versturen.

Verbinding: Instellingen → Serververbinding. Het serveradres is
http://100.118.124.29:2285. Gebruik het token uit het lokale serverdashboard.
Opslaan controleert eerst de daadwerkelijke geautoriseerde `/state`-respons.
Een ongeldige of onbereikbare nieuwe verbinding vervangt de bestaande niet.

Dagelijkse ChatGPT-cloudtaak: vDcoach ochtendplan, 07:00 Europe/Stockholm.
Eerste gecontroleerde run op 10 november 2026 heeft een dagplan en vijf actuele
sollicitatieregistraties opgeslagen; de serverrespons is onafhankelijk gecontroleerd.
https://chatgpt.com/c/6af330a6-fe84-83ed-84ea-23ccb06e0830

Bouw de update met dezelfde Android-ondertekeningssleutel als de bestaande APK.
Verwijder de huidige app niet: een update moet de lokale invoer behouden.

## Gecontroleerd installatiebestand

`outputs/vDcoach-1.2.0.apk` is met succes gebouwd op de bestaande Android-
bouwlaptop, in een aparte tijdelijke map. Pakket: `nl.vandijk.coach`,
versionCode 3. De SHA-256-certificaatvingerafdruk is gelijk aan de bestaande
vDcoach-APK op die laptop. Geen sleutel naar deze server gekopieerd.

APK SHA-256: `6e6568972e109d359ffa46db937b914aa6871ae9be4b159a48381a12f041cf82`.

De telefoon was niet aangesloten; installatie en een echte telefoonsynchronisatie
zijn nog niet gecontroleerd. Installeer als update, verwijder de oude app niet.
Open daarna met Tailscale aan en controleer Serververbinding in Instellingen.
