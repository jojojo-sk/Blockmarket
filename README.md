# BLOCKMARKET – Minecraft Java Shop

Ein kleiner Online-Shop für Minecraft-Java-Items. Spieler wählen Items und Mengen aus und senden eine Bestellung. Im Admin-Bereich kannst du Bestellungen annehmen, ablehnen und nach der manuellen Übergabe als geliefert markieren.

## Voraussetzungen
- Node.js 20 oder neuer
- Internetverbindung beim ersten Start (für npm-Pakete und Item-Bilder)

## Lokal starten
1. Entpacke den ZIP-Ordner.
2. Öffne ein Terminal im Ordner `blockmarket`.
3. Installiere die Pakete:
   ```bash
   npm install
   ```
4. Kopiere `.env.example` zu `.env`.
5. Ändere in `.env` mindestens `ADMIN_PASSWORD` und `SESSION_SECRET`.
6. Starte den Shop:
   ```bash
   npm start
   ```
7. Öffne `http://localhost:3000`.

## Getrennte Zugänge
- Käufer-Shop: `http://localhost:3000/`
- Admin-Bereich: `http://localhost:3000/admin`

Der Admin-Link ist nicht im Käufer-Shop eingeblendet. Öffne `/admin` direkt und gib das Passwort aus `.env` ein. Neue Bestellungen erscheinen dort; der Bereich fragt alle 12 Sekunden nach neuen Bestellungen. Wenn du eine Bestellung annimmst, lieferst du die Items selbst im Minecraft-Server und markierst sie anschließend als geliefert.

## Für andere Spieler erreichbar machen
`localhost` ist nur auf deinem eigenen Gerät erreichbar. Damit Freunde den Shop nutzen können, muss die App auf einem Server/Hosting laufen, der von außen erreichbar ist. Nutze HTTPS und setze `NODE_ENV=production`, `SESSION_SECRET` und `ADMIN_PASSWORD` sicher. Für einen öffentlichen produktiven Betrieb sollte außerdem ein dauerhafter Session-Store statt des eingebauten Express-Memory-Stores eingerichtet werden.

## Hinweise / Grenzen der ersten Version
- Die Itemliste wird aus `minecraft-data` für die in `.env` eingestellte Java-Version erzeugt.
- Die Shop-Ansicht ist ein Startpunkt; die Item-Bilder kommen von mcasset.cloud. Falls ein Bild nicht verfügbar ist, erscheint ein Platzhalter.
- Es gibt keine Bezahlung und keine automatische Ingame-Lieferung.
- Bestellungen werden lokal in `blockmarket.sqlite` gespeichert.
- Der Admin-Bereich ist passwortgeschützt. Verwende ein starkes, eigenes Passwort und gib es nicht weiter.
- Dieses Fanprojekt ist nicht mit Mojang oder Microsoft verbunden.
