function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

export function getR2PublicBaseUrl(): string | null {
  const value = process.env.R2_PUBLIC_BASE_URL?.trim();
  return value ? value.replace(/\/+$/g, '') : null;
}

export function buildR2PublicUrl(objectKey: string | null | undefined): string | null {
  if (!objectKey) return null;
  const baseUrl = getR2PublicBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}/${trimSlashes(objectKey)}`;
}

export function resolveAerialImageUrl(
  objectKey: string | null | undefined,
  cachedImageUrl: string | null | undefined,
): string | null {
  return buildR2PublicUrl(objectKey) ?? cachedImageUrl ?? null;
}
