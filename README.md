# transit-providers

Fahrplan-Provider-Adapter mit einheitlichem Interface, aktuell für die
**Transitous**-API ([MOTIS 2](https://transitous.org/api/), Endpoint
`https://api.transitous.org/api`). Entstanden für die Transit-App einer
privaten Local-First-PWA-Plattform; dieser Adapter ist öffentlich, weil die
[Transitous-Nutzungsordnung](https://transitous.org/api/) offengelegten Code
für API-Nutzer verlangt.

## Adapter: `src/transitous.js`

Pure Node-ESM ohne Dependencies (nur `fetch`). Läuft ab Node 18.

### Interface

```
findStops(place)                      -> [{ id, name, lat, lng }]
stationBoard(stopId, { when })         -> { stop, departures[] }
planJourney({ fromId, toId, when })    -> { journeys[] }
viewTrain(runId)                       -> { line, direction, stops[], ... }
```

Feldmapping pro Abfahrt/Leg (immer beide Zeiten, Delay zusätzlich als
`delayMinutes` vorberechnet):

| Interface-Feld | MOTIS-Quelle |
|---|---|
| `plannedTime` / `plannedDeparture` | `scheduledDeparture` / `scheduledStartTime` |
| `predictedTime` / `departure` | `departure` / `startTime` (Echtzeit-Prognose, wenn vorhanden) |
| `delayMinutes` | Differenz Prognose − Soll (in Minuten, selbst berechnet) |
| `realTime` | `realTime`-Flag des Feeds |
| `runId` | `tripId` (für `viewTrain` → `/v1/trip`) |

### Endpoints

- `GET /v1/geocode` – Haltestellensuche
- `GET /v1/stoptimes` – Abfahrtstafel (Soll + Prognose je Abfahrt)
- `GET /v1/plan` – Verbindungsplanung (`itineraries[].legs[]`)
- `GET /v1/trip` – kompletter Laufweg einer Fahrt (`legs[0].intermediateStops`)

## Nutzung & Caching (Load-Profil)

Der Adapter selbst cached nicht — das macht der Konsument. In der
produktiven Nutzung (siehe Referenz-Plattform) wird pro Station/Route
maximal **1 API-Request pro 60 s (Tafel)** bzw. **pro 5 min (Routing,
Zeit auf 5-Minuten-Bucket gerundet)** gefeuert, unabhängig von der Zahl der
Betrachter.

Jeder Request sendet einen `User-Agent` mit Name, Version und Kontakt-URL
(Policy-Punkt „contact information"). Browser-Demo kann keinen User-Agent
setzen und nutzt daher `Referer` + Quellen-Attribution im Footer.

## Demo

`demo/index.html` – client-only (CORS der Transitous-API ist offen),
läuft direkt aus dem Browser, z. B. via GitHub Pages. Zeigt Abfahrtstafeln
mit Soll- vs. Echtzeit-Prognose (farbige Abweichungen, Echtzeit-Badges) und
eine einfache Verbindungssuche.

## Attribution

Diese Software nutzt Fahrplandaten von
[Transitous](https://transitous.org) — Quellen und Lizenzen:
[transitous.org/sources](https://transitous.org/sources/). Enthaltene
OpenStreetMap-Daten unterliegen den OSM-Attribution-Guidelines.

## Lizenz

[MIT](LICENSE)
