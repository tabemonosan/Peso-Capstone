import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const controlTag = /<(input|select|textarea)\b/g
const darkBackgroundClass = /\b(?:bg|from|via|to)-(?:black|(?:slate|gray|neutral|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:700|800|900|950))\b|\b(?:bg|from|via|to)-\[#(?:0[0-9a-f]{5}|1[0-9a-f]{5})\]/i

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(fullPath)
    return /\.(jsx|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

function readControlTags(source) {
  const tags = []
  for (const match of source.matchAll(controlTag)) {
    let braceDepth = 0
    let quote = ""
    let escaped = false
    for (let index = match.index; index < source.length; index += 1) {
      const character = source[index]
      if (quote) {
        if (escaped) escaped = false
        else if (character === "\\") escaped = true
        else if (character === quote) quote = ""
        continue
      }
      if (character === "'" || character === '"' || character === "`") quote = character
      else if (character === "{") braceDepth += 1
      else if (character === "}") braceDepth -= 1
      else if (character === ">" && braceDepth === 0) {
        tags.push(source.slice(match.index, index + 1))
        break
      }
    }
  }
  return tags
}

describe("shared light form styles", () => {
  it("does not put dark background classes on native form controls", () => {
    const violations = listSourceFiles(sourceRoot).flatMap((file) => (
      readControlTags(readFileSync(file, "utf8"))
        .filter((tag) => darkBackgroundClass.test(tag))
        .map((tag) => `${path.relative(sourceRoot, file)}: ${tag.replace(/\s+/g, " ").slice(0, 180)}`)
    ))

    expect(violations).toEqual([])
  })
})
