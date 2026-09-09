/**
 * Service to fetch real road-following routes (like Google Maps) using OSRM and backend fallback.
 */

const routeCache = new Map<string, [number, number][]>();

export interface RouteGeometryResult {
  coordinates: [number, number][];
  distanceMeters?: number;
  durationSeconds?: number;
}

/**
 * Fetch real road coordinates for a sequence of [lat, lon] waypoints.
 */
export async function fetchRoadRoute(
  waypoints: [number, number][],
  avoidPoint?: [number, number] | null
): Promise<[number, number][]> {
  if (waypoints.length < 2) {
    return waypoints;
  }

  // Filter out invalid/NaN coordinates
  const validWaypoints = waypoints.filter(
    (wp) =>
      Array.isArray(wp) &&
      wp.length >= 2 &&
      typeof wp[0] === 'number' &&
      typeof wp[1] === 'number' &&
      !isNaN(wp[0]) &&
      !isNaN(wp[1])
  );

  if (validWaypoints.length < 2) {
    return validWaypoints;
  }

  // If avoidPoint is provided, introduce detour waypoints if the straight segment intersects/passes close to avoidPoint
  let routingWaypoints = [...validWaypoints];
  if (avoidPoint && typeof avoidPoint[0] === 'number' && typeof avoidPoint[1] === 'number') {
    routingWaypoints = insertDetourWaypoints(validWaypoints, avoidPoint);
  }

  const cacheKey = JSON.stringify(routingWaypoints);
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  // 1. Try Direct OSRM driving API
  try {
    // Format: lon,lat;lon,lat;...
    const coordString = routingWaypoints.map(([lat, lon]) => `${lon},${lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson&steps=false`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes.length > 0 && data.routes[0].geometry?.coordinates) {
        // GeoJSON coordinates are [lon, lat] -> convert to Leaflet [lat, lon]
        const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
          ([lon, lat]: [number, number]) => [lat, lon]
        );
        if (coords.length >= 2) {
          routeCache.set(cacheKey, coords);
          return coords;
        }
      }
    }
  } catch (err) {
    // If direct OSRM failed (e.g. rate limit, offline, timeout), fallback to backend proxy
    console.debug('OSRM direct fetch skipped/failed, trying backend proxy...', err);
  }

  // 2. Try Backend route geometry proxy
  try {
    const res = await fetch('/api/network/route-geometry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waypoints: routingWaypoints }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.coordinates && data.coordinates.length >= 2) {
        routeCache.set(cacheKey, data.coordinates);
        return data.coordinates;
      }
    }
  } catch (err) {
    console.debug('Backend route geometry fetch failed:', err);
  }

  // 3. Fallback: Return original waypoints
  routeCache.set(cacheKey, validWaypoints);
  return validWaypoints;
}

/**
 * Generate detour waypoints around an incident / obstacle.
 */
function insertDetourWaypoints(
  waypoints: [number, number][],
  avoidPoint: [number, number]
): [number, number][] {
  const [avoidLat, avoidLon] = avoidPoint;
  const result: [number, number][] = [];

  for (let i = 0; i < waypoints.length; i++) {
    result.push(waypoints[i]);
    if (i < waypoints.length - 1) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];

      // Check distance from avoidPoint to segment p1-p2
      const distToSegment = pointToSegmentDistance(avoidLat, avoidLon, p1[0], p1[1], p2[0], p2[1]);
      // If incident is close (e.g. within ~0.008 deg ≈ 800m), add a lateral bypass waypoint
      if (distToSegment < 0.008) {
        // Compute perpendicular offset
        const dLat = p2[0] - p1[0];
        const dLon = p2[1] - p1[1];
        const segLen = Math.sqrt(dLat * dLat + dLon * dLon) || 1e-6;
        // Perpendicular vector (-dLon, dLat)
        const perpLat = (-dLon / segLen) * 0.005;
        const perpLon = (dLat / segLen) * 0.005;

        const midLat = (p1[0] + p2[0]) / 2;
        const midLon = (p1[1] + p2[1]) / 2;

        result.push([midLat + perpLat, midLon + perpLon]);
      }
    }
  }

  return result;
}

function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}
