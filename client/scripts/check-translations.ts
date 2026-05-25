#!/usr/bin/env tsx
/**
 * Checks that every key in nl.ts has a corresponding key in en.ts and vice versa.
 * Run: npx tsx scripts/check-translations.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const NL_PATH = path.resolve(__dirname, '../src/i18n/translations/nl.ts')
const EN_PATH = path.resolve(__dirname, '../src/i18n/translations/en.ts')

function extractKeys(filePath: string): Set<string> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const keys = new Set<string>()
  // Match single-quoted or double-quoted keys at the start of object entries
  const re = /^\s*'([^']+)'\s*:/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    keys.add(m[1])
  }
  return keys
}

const nlKeys = extractKeys(NL_PATH)
const enKeys = extractKeys(EN_PATH)

const missingInEn = [...nlKeys].filter(k => !enKeys.has(k))
const missingInNl = [...enKeys].filter(k => !nlKeys.has(k))

let exitCode = 0

if (missingInEn.length > 0) {
  console.log(`\n❌ ${missingInEn.length} keys in nl.ts MISSING from en.ts:\n`)
  missingInEn.forEach(k => console.log(`  ${k}`))
  exitCode = 1
} else {
  console.log('\n✅ No keys missing from en.ts')
}

if (missingInNl.length > 0) {
  console.log(`\n❌ ${missingInNl.length} keys in en.ts MISSING from nl.ts:\n`)
  missingInNl.forEach(k => console.log(`  ${k}`))
  exitCode = 1
} else {
  console.log('✅ No keys missing from nl.ts')
}

console.log(`\nnl.ts: ${nlKeys.size} keys  |  en.ts: ${enKeys.size} keys\n`)

process.exit(exitCode)
