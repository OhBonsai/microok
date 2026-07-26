// microok: notes-centric view of the current directory (vault).
// New file on top of upstream — see docs/DIVERGENCE.md for the wiring points.
import { useNavigate, useParams } from "@solidjs/router"
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { useCommand } from "@/context/command"
import { useSDK } from "@/context/sdk"
import { filterNotes, noteTitle } from "./notes-model"

const NOTE_LIMIT = 500

/** Registers the palette entry that jumps from any session view into notes. */
export function NotesCommand() {
  const command = useCommand()
  const navigate = useNavigate()
  const params = useParams<{ dir: string }>()

  command.register("notes", () => [
    {
      id: "notes.open",
      title: "Notes: Open vault notes",
      category: "Notes",
      onSelect: () => navigate(`/${params.dir}/notes`),
    },
  ])

  return null
}

export function NotesPage() {
  const sdk = useSDK()
  const navigate = useNavigate()
  const params = useParams<{ dir: string }>()
  const [selected, setSelected] = createSignal<string>()

  const [notes] = createResource(
    () => sdk().directory,
    async () => {
      const res = await sdk().client.find.files({ query: ".md", type: "file", limit: NOTE_LIMIT })
      return filterNotes(res.data ?? [])
    },
  )

  const [content] = createResource(selected, async (path) => {
    const res = await sdk().client.file.read({ path })
    return res.data
  })

  const active = createMemo(() => selected())

  return (
    <div class="flex h-full min-h-0 w-full">
      <aside class="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border-base">
        <div class="flex items-center justify-between px-3 py-2">
          <span class="text-sm font-medium">Notes</span>
          <button
            type="button"
            class="text-xs opacity-70 hover:opacity-100"
            onClick={() => navigate(`/${params.dir}/session`)}
          >
            Chat
          </button>
        </div>
        <Show when={!notes.loading} fallback={<div class="px-3 py-2 text-xs opacity-60">Loading…</div>}>
          <Show when={(notes()?.length ?? 0) > 0} fallback={<EmptyVaultHint />}>
            <ul class="flex-1">
              <For each={notes()}>
                {(path) => (
                  <li>
                    <button
                      type="button"
                      class="w-full truncate px-3 py-1.5 text-left text-sm hover:bg-background-stronger"
                      classList={{ "bg-background-stronger": active() === path }}
                      title={path}
                      onClick={() => setSelected(path)}
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
        <Show when={active()} fallback={<NotesPlaceholder />}>
          {(path) => (
            <article class="mx-auto max-w-3xl px-6 py-6">
              <h1 class="mb-4 text-xl font-semibold">{noteTitle(path())}</h1>
              <Show when={!content.loading && content()} fallback={<div class="text-sm opacity-60">Loading…</div>}>
                {(file) => (
                  <Show
                    when={file().type === "text"}
                    fallback={<div class="text-sm opacity-60">Binary file — cannot preview.</div>}
                  >
                    <Markdown text={file().content} cacheKey={path()} />
                  </Show>
                )}
              </Show>
            </article>
          )}
        </Show>
      </main>
    </div>
  )
}

function NotesPlaceholder() {
  return (
    <div class="flex h-full items-center justify-center">
      <p class="max-w-sm text-center text-sm opacity-60">
        Select a note on the left, or open Chat and ask the agent to create one.
      </p>
    </div>
  )
}

function EmptyVaultHint() {
  return (
    <div class="px-3 py-2 text-xs opacity-60">
      No markdown notes yet. Open Chat and ask the agent to create your first note.
    </div>
  )
}
