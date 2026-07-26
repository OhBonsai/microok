import { describe, expect, test } from "bun:test"
import { filterNotes, noteTitle } from "./notes-model"

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
