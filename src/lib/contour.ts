import { contours } from 'd3-contour';
import type { ElevationGridData } from './geo';

export interface ContourLayer {
  threshold: number;
  coordinates: Array<Array<[number, number]>>; // polygon rings in [lat, lng] order
}

/**
 * Generate contour lines from an elevation grid.
 * intervalM: elevation interval in meters (e.g., 5 for a line every 5m).
 *
 * The returned coordinates are in [lat, lng] order, projected from the
 * grid's origin using cell_size_m for spacing.
 */
export function generateContourLayers(
  grid: ElevationGridData,
  intervalM: number,
): ContourLayer[] {
  const { origin_lat, origin_lng, rows, cols, cell_size_m, elevations } = grid;

  if (rows <= 0 || cols <= 0 || elevations.length !== rows * cols || intervalM <= 0) {
    return [];
  }

  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);

  if (!isFinite(minElev) || !isFinite(maxElev)) {
    return [];
  }

  // Build threshold values at the given interval
  const startThreshold = Math.ceil(minElev / intervalM) * intervalM;
  const thresholds: number[] = [];
  for (let t = startThreshold; t <= maxElev; t += intervalM) {
    thresholds.push(t);
  }

  if (thresholds.length === 0) {
    return [];
  }

  // d3-contour works in grid-pixel space (col, row)
  const contoursGenerator = contours()
    .size([cols, rows])
    .thresholds(thresholds)
    .smooth(true);

  // d3-contour expects values in row-major order (row 0 first, col varies fastest)
  const contourData = contoursGenerator(elevations);

  // Approximate degrees per meter for coordinate conversion
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((origin_lat * Math.PI) / 180);
  const cellDegLat = cell_size_m / metersPerDegLat;
  const cellDegLng = cell_size_m / metersPerDegLng;

  const layers: ContourLayer[] = [];

  for (const contourFeature of contourData) {
    const coordinates: Array<Array<[number, number]>> = [];

    for (const polygon of contourFeature.coordinates) {
      for (const ring of polygon) {
        const converted: Array<[number, number]> = ring.map(([col, row]) => {
          const lat = origin_lat + row * cellDegLat;
          const lng = origin_lng + col * cellDegLng;
          return [lat, lng];
        });
        coordinates.push(converted);
      }
    }

    if (coordinates.length > 0) {
      layers.push({
        threshold: contourFeature.value,
        coordinates,
      });
    }
  }

  return layers;
}
