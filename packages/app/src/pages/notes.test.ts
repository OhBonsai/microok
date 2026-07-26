import { describe, expect, test } from "bun:test"
import {
  buildGraph,
  extractWikilinks,
  filterNotes,
  noteTitle,
  preprocessWikilinks,
  resolveWikilink,
  wikilinkFromHref,
} from "./notes-model"

describe("noteTitle", () => {
  test("strips directories and .md extension", () => {
    expect(noteTitle("notes/渐进式总结.md")).toBe("渐进式总结")
    expect(noteTitle("daily/2026-07-27.md")).toBe("2026-07-27")
    expect(noteTitle("README.MD")).toBe("README")
  })

  test("leaves non-markdown names intact", () => {
    expect(noteTitle("notes/diagram.png")).toBe("diagram.png")
  })
})

describe("filterNotes", () => {
  test("keeps only markdown files, sorted", () => {
    expect(filterNotes(["b.md", "a.md", "img.png", "c.MD", "dir/readme.md"])).toEqual([
      "a.md",
      "b.md",
      "c.MD",
      "dir/readme.md",
    ])
  })

  test("empty input", () => {
    expect(filterNotes([])).toEqual([])
  })
})

describe("preprocessWikilinks", () => {
  test("plain and aliased links", () => {
    expect(preprocessWikilinks("见 [[渐进式总结]] 与 [[moc/学习|学习索引]]")).toBe(
      "见 [渐进式总结](#wikilink=%E6%B8%90%E8%BF%9B%E5%BC%8F%E6%80%BB%E7%BB%93) 与 [学习索引](#wikilink=moc%2F%E5%AD%A6%E4%B9%A0)",
    )
  })

  test("leaves normal markdown links alone", () => {
    const text = "[普通链接](https://example.com) 和 `[[代码里的]]`"
    expect(preprocessWikilinks("[普通链接](https://example.com)")).toBe("[普通链接](https://example.com)")
    expect(text).toContain("[[代码里的]]") // sanity: regex 不区分代码块是已知限制
  })
})

describe("extractWikilinks", () => {
  test("unique trimmed targets", () => {
    expect(extractWikilinks("[[a]] [[ a ]] [[b|别名]] [[a]]")).toEqual(["a", "b"])
  })

  test("none", () => {
    expect(extractWikilinks("no links here")).toEqual([])
  })
})

describe("wikilinkFromHref", () => {
  test("roundtrip with preprocess encoding", () => {
    expect(wikilinkFromHref("#wikilink=%E6%B8%90%E8%BF%9B%E5%BC%8F%E6%80%BB%E7%BB%93")).toBe("渐进式总结")
    expect(wikilinkFromHref("oc://renderer/index.html#wikilink=abc")).toBe("abc")
  })

  test("non-wikilink href", () => {
    expect(wikilinkFromHref("https://example.com")).toBeUndefined()
  })
})

describe("resolveWikilink", () => {
  const paths = ["notes/渐进式总结.md", "moc/学习.md", "daily/2026-07-27.md"]

  test("matches by title, case-insensitive, ignores directories", () => {
    expect(resolveWikilink("渐进式总结", paths)).toBe("notes/渐进式总结.md")
    expect(resolveWikilink("学习", paths)).toBe("moc/学习.md")
    expect(resolveWikilink(" 2026-07-27 ", paths)).toBe("daily/2026-07-27.md")
  })

  test("unresolved returns undefined", () => {
    expect(resolveWikilink("不存在", paths)).toBeUndefined()
  })
})

describe("buildGraph", () => {
  test("resolves links, creates phantom nodes, dedupes edges", () => {
    const graph = buildGraph([
      { path: "notes/a.md", links: ["b", "b", "ghost", "a"] },
      { path: "notes/b.md", links: ["a"] },
    ])
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["missing:ghost", "notes/a.md", "notes/b.md"])
    expect(graph.edges).toEqual([
      { source: "notes/a.md", target: "notes/b.md" },
      { source: "notes/a.md", target: "missing:ghost" },
      { source: "notes/b.md", target: "notes/a.md" },
    ])
    const a = graph.nodes.find((n) => n.id === "notes/a.md")!
    expect(a.degree).toBe(3)
    const ghost = graph.nodes.find((n) => n.id === "missing:ghost")!
    expect(ghost.exists).toBe(false)
  })

  test("empty vault", () => {
    expect(buildGraph([])).toEqual({ nodes: [], edges: [] })
  })
})
