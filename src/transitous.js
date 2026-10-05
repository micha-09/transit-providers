/**
 * Provider 'transitous': Anbindung an api.transitous.org (MOTIS 2 API,
 * https://transitous.org/api/). Community-Service mit GTFS/GTFS-RT-Feeds
 * (u. a. DELFI fuer Deutschland) - liefert echte Echtzeit-Verspaetungen,
 * soweit die Quellfeeds sie bereitstellen.
 *
 * Nutzungsbedingungen (Transitous Usage Policy): Open-Source-Nutzung,
 * User-Agent mit Kontakt, Attribution von transitous.org/sources/,
 * Routing-Endpoint nach Anmeldung. Caching macht der Konsument.
 */

const BASE_URL = process.env.TRANSITOUS_API_BASE ?? 'https://api.transitous.org/api';
const VERSION = '1.0.0';
// Policy-Punkt 3: User-Agent mit App-Name, Version und Kontakt-URL.
const USER_AGENT = `transit-providers/${VERSION} (https://github.com/micha-09/transit-providers)`;

async function get(path, params = {}) {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Transitous ${path}: HTTP ${res.status}`);
  }
  return res.json();
}

function minutesBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 60_000);
}

// GTFS-Modi auf die im Interface genutzten Kategorien (rail/bus/tram/...)
function mapMode(mode) {
  switch (mode) {
    case 'HIGHSPEED_RAIL':
    case 'LONG_DISTANCE':
    case 'NIGHT_RAIL':
    case 'REGIONAL_RAIL':
    case 'RAIL': return 'rail';
    case 'SUBWAY': return 'metro';
    case 'SUBURBAN': return 'rail';
    case 'TRAM': return 'tram';
    case 'BUS':
    case 'COACH': return 'bus';
    case 'FERRY': return 'ferry';
    case 'WALK': return 'walk';
    default: return 'other';
  }
}

export async function findStops(place) {
  const matches = await get('/v1/geocode', { text: place });
  return (matches ?? [])
    .filter((m) => m.type === 'STOP' || m.id)
    .map((m) => ({
      id: m.id,
      name: m.name,
      lat: m.lat,
      lng: m.lon,
    }));
}

export async function stationBoard(stopId, { when } = {}) {
  const res = await get('/v1/stoptimes', { stopId, n: 50, ...(when ? { time: when } : {}) });
  const times = res.stopTimes ?? [];
  return {
    stop: { id: stopId, name: res.place?.name },
    departures: times.map((d) => {
      const p = d.place ?? {};
      const planned = p.scheduledDeparture ?? p.departure;
      const predicted = p.departure;
      // Delay selbst berechnen: Prognose minus Soll (beide UTC-ISO).
      const delayMinutes = predicted && planned ? minutesBetween(predicted, planned) : 0;
      return {
        line: d.routeShortName ?? d.displayName ?? d.mode,
        mode: mapMode(d.mode),
        direction: d.headsign ?? d.routeLongName ?? '',
        plannedTime: planned,
        predictedTime: predicted,
        delayMinutes,
        cancelled: Boolean(p.cancelled),
        realTime: Boolean(d.realTime),
        // MOTIS tripId als runId-Ersatz; Zugverlauf via /v1/trip abrufbar.
        runId: d.tripId,
        platform: p.track,
      };
    }),
  };
}

export async function planJourney({ fromId, toId, when }) {
  const res = await get('/v1/plan', {
    fromPlace: fromId,
    toPlace: toId,
    time: when,
    n: 8,
  });
  return {
    journeys: (res.itineraries ?? []).map((it) => ({
      legs: (it.legs ?? []).map((l) => {
        const depDelay = minutesBetween(l.startTime, l.scheduledStartTime);
        const arrDelay = minutesBetween(l.endTime, l.scheduledEndTime);
        return {
          origin: { id: l.from?.stopId, name: l.from?.name },
          destination: { id: l.to?.stopId, name: l.to?.name },
          plannedDeparture: l.scheduledStartTime,
          departure: l.startTime,
          plannedArrival: l.scheduledEndTime,
          arrival: l.endTime,
          delayMinutes: Math.max(depDelay, arrDelay),
          line: l.routeShortName ?? l.displayName ?? (l.mode === 'WALK' ? 'Fußweg' : l.mode),
          mode: mapMode(l.mode),
          direction: l.headsign ?? l.tripTo?.name ?? '',
          cancelled: Boolean(l.cancelled),
          realTime: Boolean(l.realTime),
          runId: l.tripId,
          walk: l.mode === 'WALK',
        };
      }),
    })),
  };
}

export async function viewTrain(tripId) {
  // /v1/trip antwortet direkt mit einem 'trip'-Objekt (duration/legs),
  // dessen legs[0] den kompletten Lauf incl. intermediateStops traegt.
  const trip = await get('/v1/trip', { tripId });
  const leg = (trip.legs ?? [])[0] ?? {};
  // Alle Halte: Start, Zwischenhalte, Ziel - reihenfolgegetreu.
  const raw = [
    leg.from,
    ...(leg.intermediateStops ?? []),
    leg.to,
  ].filter((s) => s && s.name);
  const stops = raw.map((p) => ({
    id: p.stopId,
    name: p.name,
    plannedDeparture: p.scheduledDeparture,
    departure: p.departure,
    plannedArrival: p.scheduledArrival,
    arrival: p.arrival,
    delayMinutes: p.arrival && p.scheduledArrival
      ? minutesBetween(p.arrival, p.scheduledArrival)
      : 0,
    cancelled: Boolean(p.cancelled),
    realTime: Boolean(leg.realTime),
    platform: p.track,
  }));
  return {
    runId: tripId,
    line: { name: leg.routeShortName ?? leg.displayName, mode: mapMode(leg.mode) },
    direction: leg.headsign ?? leg.tripTo?.name ?? '',
    serviceDate: leg.serviceDate,
    currentDelayMinutes: stops.reduce((m, s) => Math.max(m, s.delayMinutes), 0),
    cancelled: Boolean(leg.cancelled),
    realTime: Boolean(leg.realTime),
    stops,
  };
}
