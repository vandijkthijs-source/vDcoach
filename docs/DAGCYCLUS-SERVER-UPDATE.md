# Dagcyclus activeren op de bestaande server

De appwijzigingen staan in ~/Projects/vDcoach; de APK bouwt Thijs zelf.
De bestaande ChatGPT-taak is bedoeld voor dagverwerking gevolgd door planning om
07:00. De server moet eerst de nieuwe endpoints en MCP-tools krijgen.

Kopieer outputs/vDcoach-dagcyclus-server.patch naar de bestaande serverlaptop.
Pas alleen daar toe, vanuit /home/thijs/Documents/ChatGPT/VdCoach:

```bash
git apply --check /pad/naar/vDcoach-dagcyclus-server.patch
git apply /pad/naar/vDcoach-dagcyclus-server.patch
python3 -m py_compile server/day_review.py server/server.py server/coaching_store.py
node --check server/mcp.mjs
systemctl --user restart vdcoach.service
systemctl --user restart vdcoach-tunnel.service
```

Bij een conflict NIET forceren: behoud de serverwijzigingen en voeg gericht samen.
De patch bevat uitsluitend serverbroncode, geen runtimegegevens of tokens. Er
worden geen nieuwe diensten/tunnels/backups gestart. De bestaande service sluit
oude dagen binnen 30 seconden na Amsterdamse middernacht, ook na een herstart.

Controleer via de bestaande private plugin get_day_reviews, get_coach_context en
get_day. Als de toollijst oud is, laad de bestaande pluginverbinding opnieuw.
De eerste pending dagen mogen echte gebruikersinvoer bevatten: gebruik geen
fictieve voortgang als productietest. Dag sluiten vinkt niets af. Late offline-invoer
verandert het inputHash en wordt opnieuw verwerkt bij de volgende ochtendrun.
