// microok: pure helpers for the notes view, kept UI-free so they stay bun-testable.
export function noteTitle(path: string) {
  const base = path.split("/").pop() ?? path
  return base.replace(/\.md$/i, "")
}

export function filterNotes(paths: readonly string[]) {
  return paths.filter((path) => path.toLowerCase().endsWith(".md")).sort()
}
