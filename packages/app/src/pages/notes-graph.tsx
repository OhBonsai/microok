// microok: force-directed SVG graph of vault wikilinks. No external deps —
// a small spring/repulsion simulation is plenty at vault scale (<1k notes).
import { createEffect, createSignal, For, onCleanup } from "solid-js"
import type { NoteGraph } from "./notes-model"

type Point = { x: number; y: number; vx: number; vy: number }

const WIDTH = 1200
const HEIGHT = 800
const TICKS = 300
const SPRING_LENGTH = 120
const SPRING_K = 0.02
const REPULSION = 4000
const CENTER_PULL = 0.005
const DAMPING = 0.85

export function NotesGraph(props: { graph: NoteGraph; onOpen: (id: string) => void }) {
  const [positions, setPositions] = createSignal<Record<string, Point>>({})

  createEffect(() => {
    const { nodes, edges } = props.graph
    if (nodes.length === 0) {
      setPositions({})
      return
    }

    // Deterministic-ish initial ring layout, then relax.
    const points: Record<string, Point> = {}
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length
      const radius = Math.min(WIDTH, HEIGHT) / 3
      points[node.id] = {
        x: WIDTH / 2 + radius * Math.cos(angle),
        y: HEIGHT / 2 + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      }
    })

    let tick = 0
    let raf = 0
    const step = () => {
      const ids = Object.keys(points)
      // pairwise repulsion
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = points[ids[i]]
          const b = points[ids[j]]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const distSq = Math.max(dx * dx + dy * dy, 25)
          const force = REPULSION / distSq
          const dist = Math.sqrt(distSq)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          a.vx += fx
          a.vy += fy
          b.vx -= fx
          b.vy -= fy
        }
      }
      // spring along edges
      for (const edge of props.graph.edges) {
        const a = points[edge.source]
        const b = points[edge.target]
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const force = SPRING_K * (dist - SPRING_LENGTH)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
      // center gravity + integrate
      for (const id of ids) {
        const p = points[id]
        p.vx += (WIDTH / 2 - p.x) * CENTER_PULL
        p.vy += (HEIGHT / 2 - p.y) * CENTER_PULL
        p.vx *= DAMPING
        p.vy *= DAMPING
        p.x += p.vx
        p.y += p.vy
      }
      setPositions({ ...points })
      tick += 1
      if (tick < TICKS) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    onCleanup(() => cancelAnimationFrame(raf))
  })

  const radius = (degree: number) => 6 + Math.min(degree * 1.5, 12)

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} class="h-full w-full">
      <For each={props.graph.edges}>
        {(edge) => {
          const from = () => positions()[edge.source]
          const to = () => positions()[edge.target]
          return (
            <line
              x1={from()?.x ?? 0}
              y1={from()?.y ?? 0}
              x2={to()?.x ?? 0}
              y2={to()?.y ?? 0}
              stroke="currentColor"
              stroke-opacity="0.2"
            />
          )
        }}
      </For>
      <For each={props.graph.nodes}>
        {(node) => {
          const p = () => positions()[node.id]
          return (
            <g
              transform={`translate(${p()?.x ?? 0}, ${p()?.y ?? 0})`}
              class="cursor-pointer"
              onClick={() => node.exists && props.onOpen(node.id)}
            >
              <circle
                r={radius(node.degree)}
                fill="currentColor"
                fill-opacity={node.exists ? 0.8 : 0.25}
                stroke="currentColor"
                stroke-opacity={node.exists ? 1 : 0.4}
                stroke-dasharray={node.exists ? undefined : "3 3"}
              />
              <text y={radius(node.degree) + 14} text-anchor="middle" class="text-[11px]" fill="currentColor">
                {node.title}
              </text>
            </g>
          )
        }}
      </For>
    </svg>
  )
}
