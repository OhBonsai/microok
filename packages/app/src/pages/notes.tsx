// microok: notes-centric view of the current directory (vault).
// New file on top of upstream — see docs/DIVERGENCE.md for the wiring points.
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { createResource, createSignal, For, Show } from "solid-js"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { useCommand } from "@/context/command"
import { useSDK } from "@/context/sdk"
import { tabKey, useTabs, type Tab } from "@/context/tabs"
import { NotesGraph } from "./notes-graph"
import {
  buildGraph,
  extractWikilinks,
  filterNotes,
  noteTitle,
  preprocessWikilinks,
  resolveWikilink,
  wikilinkFromHref,
} from "./notes-model"

// Engine's FindFileQuery caps limit at 200.
const NOTE_LIMIT = 200
const READ_CONCURRENCY = 16

function today() {
  return new Date().toISOString().slice(0, 10)
}

function newNoteBody(title: string) {
  return `---\ntags: []\ncreated: ${today()}\n---\n\n# ${title}\n`
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Registers the palette entry that jumps into the notes view. Mounted globally
 * (SharedProviders), so it must resolve the current vault directory itself:
 * route param first, then the session/draft tabs.
 */
export function NotesCommand() {
  const command = useCommand()
  const navigate = useNavigate()
  const params = useParams<{ dir?: string }>()
  const location = useLocation()
  const tabs = useTabs()

  const directorySlug = () => {
    if (params.dir) return params.dir
    const path = location.pathname
    const active = tabs.store.find((tab) => tab.type === "session" && path.includes(`/session/${tab.sessionId}`))
    const candidates: Tab[] = [...(active ? [active] : []), ...tabs.store]
    for (const tab of candidates) {
      const dir = tab.type === "draft" ? tab.directory : tabs.info[tabKey(tab)]?.directory
      if (dir) return base64Encode(dir)
    }
    return undefined
  }

  command.register("notes", () => [
    {
      id: "notes.open",
      title: "Notes: Open vault notes",
      category: "Notes",
      disabled: !directorySlug(),
      onSelect: () => {
        const slug = directorySlug()
        if (slug) navigate(`/notes/${slug}`)
      },
    },
  ])

  return null
}

export function NotesPage() {
  const sdk = useSDK()
  const navigate = useNavigate()
  const params = useParams<{ dir: string }>()
  const [selected, setSelected] = createSignal<string>()
  const [view, setView] = createSignal<"note" | "graph">("note")
  const [mode, setMode] = createSignal<"preview" | "edit">("preview")
  const [draft, setDraft] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [creating, setCreating] = createSignal(false)

  const [notes, { refetch: refetchNotes }] = createResource(
    () => sdk().directory,
    async () => {
      // Swallow errors: a failed listing should degrade to an empty vault,
      // not feed the route-level error boundary.
      const res = await sdk()
        .client.find.files({ query: ".md", type: "file", limit: NOTE_LIMIT })
        .catch(() => ({ data: [] as string[] }))
      return filterNotes(res.data ?? [])
    },
  )

  const [content, { refetch: refetchContent }] = createResource(selected, async (path) => {
    const res = await sdk().client.file.read({ path })
    return res.data
  })

  const [graph] = createResource(
    () => (view() === "graph" ? (notes() ?? []) : undefined),
    async (paths) => {
      const entries = await mapLimit(paths, READ_CONCURRENCY, async (path) => {
        const res = await sdk()
          .client.file.read({ path })
          .catch(() => ({ data: undefined }))
        const file = res.data
        return { path, links: file?.type === "text" ? extractWikilinks(file.content) : [] }
      })
      return buildGraph(entries)
    },
  )

  const openNote = (path: string) => {
    setSelected(path)
    setMode("preview")
    setView("note")
  }

  const createNote = async (title: string) => {
    const clean = title.trim()
    if (!clean) return
    const existing = resolveWikilink(clean, notes() ?? [])
    if (existing) return openNote(existing)
    const path = `notes/${clean}.md`
    await sdk().client.file.write({ path, content: newNoteBody(clean) })
    await refetchNotes()
    openNote(path)
  }

  const openWikilink = async (target: string) => {
    const resolved = resolveWikilink(target, notes() ?? [])
    if (resolved) return openNote(resolved)
    await createNote(target)
  }

  const startEdit = () => {
    const file = content()
    if (!file || file.type !== "text") return
    setDraft(file.content)
    setMode("edit")
  }

  const save = async () => {
    const path = selected()
    if (!path || saving()) return
    setSaving(true)
    try {
      await sdk().client.file.write({ path, content: draft() })
      await refetchContent()
      setMode("preview")
    } finally {
      setSaving(false)
    }
  }

  const dirty = () => mode() === "edit" && draft() !== (content()?.content ?? "")

  const handlePreviewClick = (event: MouseEvent) => {
    const anchor = (event.target as HTMLElement).closest("a")
    if (!anchor) return
    const target = wikilinkFromHref(anchor.getAttribute("href") ?? "")
    if (!target) return
    event.preventDefault()
    void openWikilink(target)
  }

  const handleEditorKeydown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault()
      void save()
    }
  }

  return (
    <div class="flex h-full min-h-0 w-full">
      <aside class="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border-base">
        <div class="flex items-center gap-2 px-3 py-2">
          <span class="flex-1 text-sm font-medium">Notes</span>
          <button
            type="button"
            class="text-xs opacity-70 hover:opacity-100"
            classList={{ "font-semibold opacity-100": view() === "graph" }}
            onClick={() => setView(view() === "graph" ? "note" : "graph")}
          >
            Graph
          </button>
          <button
            type="button"
            class="text-xs opacity-70 hover:opacity-100"
            onClick={() => setCreating(!creating())}
          >
            New
          </button>
          <button
            type="button"
            class="text-xs opacity-70 hover:opacity-100"
            onClick={() => navigate(`/${params.dir}/session`)}
          >
            Chat
          </button>
        </div>
        <Show when={creating()}>
          <div class="px-3 pb-2">
            <input
              type="text"
              autofocus
              placeholder="Note title, Enter to create"
              class="w-full rounded border border-border-base bg-transparent px-2 py-1 text-sm outline-none"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const value = event.currentTarget.value
                  event.currentTarget.value = ""
                  setCreating(false)
                  void createNote(value)
                }
                if (event.key === "Escape") setCreating(false)
              }}
            />
          </div>
        </Show>
        <Show when={!notes.loading} fallback={<div class="px-3 py-2 text-xs opacity-60">Loading…</div>}>
          <Show when={(notes()?.length ?? 0) > 0} fallback={<EmptyVaultHint />}>
            <ul class="flex-1">
              <For each={notes()}>
                {(path) => (
                  <li>
                    <button
                      type="button"
                      class="w-full truncate px-3 py-1.5 text-left text-sm hover:bg-background-stronger"
                      classList={{ "bg-background-stronger": selected() === path && view() === "note" }}
                      title={path}
                      onClick={() => openNote(path)}
                    >
                      {noteTitle(path)}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </aside>
      <main class="min-w-0 flex-1 overflow-y-auto">
        <Show
          when={view() === "note"}
          fallback={
            <Show when={!graph.loading && graph()} fallback={<CenterHint text="Building graph…" />}>
              {(data) => (
                <Show when={data().nodes.length > 0} fallback={<CenterHint text="No notes to graph yet." />}>
                  <NotesGraph graph={data()} onOpen={openNote} />
                </Show>
              )}
            </Show>
          }
        >
          <Show when={selected()} fallback={<NotesPlaceholder />}>
            {(path) => (
              <article class="mx-auto flex h-full max-w-3xl flex-col px-6 py-6">
                <header class="mb-4 flex items-center gap-3">
                  <h1 class="flex-1 truncate text-xl font-semibold">
                    {noteTitle(path())}
                    <Show when={dirty()}>
                      <span class="ml-2 text-sm opacity-50">●</span>
                    </Show>
                  </h1>
                  <Show
                    when={mode() === "edit"}
                    fallback={
                      <Show when={content()?.type === "text"}>
                        <button type="button" class="text-xs opacity-70 hover:opacity-100" onClick={startEdit}>
                          Edit
                        </button>
                      </Show>
                    }
                  >
                    <button
                      type="button"
                      class="text-xs opacity-70 hover:opacity-100"
                      onClick={() => setMode("preview")}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="text-xs font-semibold opacity-80 hover:opacity-100"
                      disabled={saving()}
                      onClick={() => void save()}
                    >
                      {saving() ? "Saving…" : "Save (⌘S)"}
                    </button>
                  </Show>
                </header>
                <Show
                  when={mode() === "edit"}
                  fallback={
                    <Show
                      when={!content.loading && content()}
                      fallback={<div class="text-sm opacity-60">Loading…</div>}
                    >
                      {(file) => (
                        <Show
                          when={file().type === "text"}
                          fallback={<div class="text-sm opacity-60">Binary file — cannot preview.</div>}
                        >
                          <div onClick={handlePreviewClick}>
                            <Markdown text={preprocessWikilinks(file().content)} />
                          </div>
                        </Show>
                      )}
                    </Show>
                  }
                >
                  <textarea
                    class="min-h-0 flex-1 resize-none bg-transparent font-mono text-sm outline-none"
                    value={draft()}
                    onInput={(event) => setDraft(event.currentTarget.value)}
                    onKeyDown={handleEditorKeydown}
                  />
                </Show>
              </article>
            )}
          </Show>
        </Show>
      </main>
    </div>
  )
}

function CenterHint(props: { text: string }) {
  return (
    <div class="flex h-full items-center justify-center">
      <p class="text-sm opacity-60">{props.text}</p>
    </div>
  )
}

function NotesPlaceholder() {
  return (
    <div class="flex h-full items-center justify-center">
      <p class="max-w-sm text-center text-sm opacity-60">
        Select a note on the left, create one with New, or open Chat and ask the agent.
      </p>
    </div>
  )
}

function EmptyVaultHint() {
  return (
    <div class="px-3 py-2 text-xs opacity-60">
      No markdown notes yet. Create one with New, or ask the agent in Chat.
    </div>
  )
}
