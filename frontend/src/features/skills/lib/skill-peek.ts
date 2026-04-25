/**
 * skill-peek — encode/decode helpers for the `?peek=skill-file:<slug>/<path>`
 * URL convention introduced in Phase 91 Plan 04.
 *
 * Why a separate scheme on the existing `peek` param:
 *   The Phase 86 peek drawer already uses `?peek=<id>&peekType=<TOKEN>` for
 *   entity peeks (notes, issues, etc.). Skill reference files have no
 *   ArtifactTokenKey of their own (they aren't first-class artifacts) and
 *   don't need a typed lookup. We piggyback on the existing `peek` param
 *   with a `skill-file:` prefix, kept intentionally short to be diff-friendly
 *   in URLs.
 *
 *   `useArtifactPeekState` inspects the prefix and routes to a separate
 *   `skillFile` field; the entity-peek dispatch is preserved untouched.
 *
 * Threat note (T-91-16, T-91-19): the path component is decoded but NOT
 * normalised here — backend Plan 91-01 owns path-traversal containment and
 * MUST reject `..` segments at the file endpoint. This helper only owns the
 * URL round-trip, including special characters like `?` and `#`, via
 * `encodeURIComponent` per path segment.
 */

export const SKILL_FILE_PEEK_PREFIX = 'skill-file:';

/**
 * Build a peek-param value pointing at a skill reference file.
 *
 * The slug and each path segment are URL-encoded individually so that
 * embedded `?`, `#`, spaces, etc. survive the round-trip. Internal `/`
 * separators in the path are preserved.
 */
export function encodeSkillFilePeek(slug: string, path: string): string {
  const encodedSlug = encodeURIComponent(slug);
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${SKILL_FILE_PEEK_PREFIX}${encodedSlug}/${encodedPath}`;
}

/**
 * Inverse of {@link encodeSkillFilePeek}. Returns `null` when:
 *   - input is null/empty
 *   - input does not begin with `SKILL_FILE_PEEK_PREFIX`
 *   - the payload is missing a slash (would yield empty slug or empty path)
 *   - the path component is empty after the slash
 *
 * The first `/` after the prefix separates slug from path; subsequent `/`
 * characters belong to the path (multi-segment refs are supported).
 */
export function decodeSkillFilePeek(
  value: string | null | undefined,
): { slug: string; path: string } | null {
  if (!value || !value.startsWith(SKILL_FILE_PEEK_PREFIX)) return null;
  const payload = value.slice(SKILL_FILE_PEEK_PREFIX.length);
  const firstSlash = payload.indexOf('/');
  // firstSlash <= 0 covers both "missing slash" and "empty slug" cases.
  if (firstSlash <= 0) return null;
  const slugRaw = payload.slice(0, firstSlash);
  const pathRaw = payload.slice(firstSlash + 1);
  if (!pathRaw) return null;
  let slug: string;
  let path: string;
  try {
    slug = decodeURIComponent(slugRaw);
    path = pathRaw.split('/').map(decodeURIComponent).join('/');
  } catch {
    // Malformed percent-encoding — treat as no peek.
    return null;
  }
  if (!slug || !path) return null;
  return { slug, path };
}
