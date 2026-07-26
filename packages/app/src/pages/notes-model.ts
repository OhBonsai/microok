// microok: pure helpers for the notes view, kept UI-free so they stay bun-testable.
export function noteTitle(path: string) {
  const base = path.split("/").pop() ?? path
  return base.replace(/\.md$/i, "")
}

export function filterNotes(paths: readonly string[]) {
  return paths.filter((path) => path.toLowerCase().endsWith(".md")).sort()
}

// --- wikilinks ---------------------------------------------------------------
// Syntax: [[target]] or [[target|alias]]. Targets match note titles
// (basename without .md), case-insensitive.

const WIKILINK_RE = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g

export const WIKILINK_HASH_PREFIX = "#wikilink="

/** Replace [[target|alias]] with markdown hash-links the preview can intercept. */
export function preprocessWikilinks(text: string) {
  return text.replace(WIKILINK_RE, (_, target: string, alias?: string) => {
    const clean = target.trim()
    return `[${(alias ?? clean).trim()}](${WIKILINK_HASH_PREFIX}${encodeURIComponent(clean)})`
  })
}

/** Unique wikilink targets appearing in a note body. */
export function extractWikilinks(text: string) {
  const targets = new Set<string>()
  for (const match of text.matchAll(WIKILINK_RE)) targets.add(match[1].trim())
  return [...targets]
}

/** Pull the target back out of an intercepted anchor href. */
export function wikilinkFromHref(href: string) {
  const index = href.indexOf(WIKILINK_HASH_PREFIX)
  if (index === -1) return
  return decodeURIComponent(href.slice(index + WIKILINK_HASH_PREFIX.length))
}

/** Resolve a wikilink target to a note path by title, case-insensitive. */
export function resolveWikilink(target: string, paths: readonly string[]) {
  const wanted = target.trim().toLowerCase()
  return paths.find((path) => noteTitle(path).toLowerCase() === wanted)
}

// --- graph -------------------------------------------------------------------

export type GraphNode = { id: string; title: string; exists: boolean; degree: number }
export type GraphEdge = { source: string; target: string }
export type NoteGraph = { nodes: GraphNode[]; edges: GraphEdge[] }

/** Build the vault link graph. Unresolved targets become phantom nodes. */
export function buildGraph(entries: readonly { path: string; links: readonly string[] }[]): NoteGraph {
  const paths = entries.map((entry) => entry.path)
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const seen = new Set<string>()

  for (const path of paths) nodes.set(path, { id: path, title: noteTitle(path), exists: true, degree: 0 })

  for (const entry of entries) {
    for (const link of entry.links) {
      const resolved = resolveWikilink(link, paths)
      const id = resolved ?? `missing:${link.trim().toLowerCase()}`
      if (!resolved && !nodes.has(id)) nodes.set(id, { id, title: link.trim(), exists: false, degree: 0 })
      if (id === entry.path) continue // self-link
      const key = `${entry.path}→${id}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ source: entry.path, target: id })
      nodes.get(entry.path)!.degree += 1
      nodes.get(id)!.degree += 1
    }
  }

  return { nodes: [...nodes.values()], edges }
}
