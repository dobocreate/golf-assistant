export interface LatLng {
  lat: number;
  lng: number;
}

/** DMS形式 "33°56'42.9"N 131°16'32.1"E" を decimal degreeに変換 */
function parseDMS(input: string): LatLng | null {
  const match = input.match(
    /(\d+)°(\d+)'([\d.]+)"([NS])\s+(\d+)°(\d+)'([\d.]+)"([EW])/
  );
  if (!match) return null;
  const [, dLat, mLat, sLat, ns, dLng, mLng, sLng, ew] = match;
  const lat = (+dLat + +mLat / 60 + +sLat / 3600) * (ns === 'S' ? -1 : 1);
  const lng = (+dLng + +mLng / 60 + +sLng / 3600) * (ew === 'W' ? -1 : 1);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

/** Google Maps URL から座標を抽出 (@lat,lng または q=lat,lng) */
function parseGoogleMapsUrl(input: string): LatLng | null {
  const atMatch = input.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) return { lat: +atMatch[1], lng: +atMatch[2] };
  const qMatch = input.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) return { lat: +qMatch[1], lng: +qMatch[2] };
  return null;
}

/** 数値座標 "34.1234, 131.8765" 形式 */
function parseDecimal(input: string): LatLng | null {
  const match = input.trim().match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)$/);
  if (!match) return null;
  return { lat: +match[1], lng: +match[2] };
}

/** DMS / Maps URL / decimal の順で試みる */
export function parseCoordinates(input: string): LatLng | null {
  return parseDMS(input) ?? parseGoogleMapsUrl(input) ?? parseDecimal(input);
}

/** Haversine公式でヤード距離を計算 */
export function haversineYards(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const meters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(meters * 1.09361);
}
