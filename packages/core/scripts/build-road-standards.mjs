// Builds packages/core/src/grade/roadStandards.ts from the road age-standard JSON.
//
// Provenance, in order. Each step reproduces the next:
// 1. Download both workbooks from the Age-Grade-Tables repository (CC0 1.0), pinned to commit
//    4aac6737cb9f216c90a0a610355667cd3d921c61, folder "2025 Files":
//    https://raw.githubusercontent.com/AlanLyttonJones/Age-Grade-Tables/4aac6737cb9f216c90a0a610355667cd3d921c61/2025%20Files/MaleRoadStd2025.xlsx
//      SHA-256 f9fc6cdc202194dccf730c352d49c025f7466e50049a54224535ece3b956099e
//    https://raw.githubusercontent.com/AlanLyttonJones/Age-Grade-Tables/4aac6737cb9f216c90a0a610355667cd3d921c61/2025%20Files/FemaleRoadStd2025.xlsx
//      SHA-256 3dd4fc6ccba593019066dece02ddda3a8b264c76f338476a6cf6c40917560c99
// 2. python3 -I packages/core/scripts/extract-road-standards.py MaleRoadStd2025.xlsx \
//      FemaleRoadStd2025.xlsx > road-standards.json
// 3. node packages/core/scripts/build-road-standards.mjs road-standards.json
//
// Run step 3 from the repository root after changing the JSON. Never edit roadStandards.ts by hand.

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'

const OUTPUT = fileURLToPath(new URL('../src/grade/roadStandards.ts', import.meta.url))
const FIRST_AGE = 5
const LAST_AGE = 100
const DISTANCE_COUNT = 22
const SEXES = ['male', 'female']
const SOURCE_FIELDS = [
  'repository',
  'commit',
  'commitDate',
  'folder',
  'licence',
  'licenceUrl',
  'approval',
  'compiled',
  'files.male',
  'files.female',
  'urls.male',
  'urls.female',
  'sha256.male',
  'sha256.female',
]

/** The 22 published road distances in metres, in table order. Any other list is refused. */
const PUBLISHED_DISTANCES_M = [
  1609.344, 5000, 6000, 6437.376, 8000, 8046.72, 10000, 11265.408, 12000, 15000, 16093.44, 20000,
  21097.5, 25000, 30000, 42195, 50000, 80467.2, 100000, 150000, 160934.4, 200000,
]

/** Anomalies found in the published workbooks when they were converted to JSON. */
const ANOMALIES = [
  '- Male age 5: 17 cells (4 Mile to 200 km, except 10 km and 7 Mile) use the 5 km age-5',
  "  factor, not their own column's. So 7 Mile (3579 s) is slower than 12 km (3150 s), the",
  '  only inversion in either table.',
  '- Female age 100, 10 km: 12172 s is the open-class time over the 7 Mile factor. The 10 km',
  '  factor gives 11686 s.',
  '- Male age 80, 12 km factor (factor sheet only) is out of line with its neighbours. Its',
  '  seconds agree with the stated factor, so the seconds here are unaffected.',
  '- Presentation-only anomalies (OC row 5 for 4 Mile, blank H:MM:SS cells, label typos) are',
  '  not in this data.',
]

const PARSER = String.raw`/** Parses table text: one line per age, one space-separated number per distance. */
function parseTable(text: string): number[][] {
  return text
    .trim()
    .split('\n')
    .map((line) => line.split(' ').map(Number))
}`

/** Describes a JSON value for an error message; never prints "undefined". */
function show(value) {
  if (value === undefined) return 'missing'
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

function fail(message) {
  throw new Error(`road-standards JSON: ${message}`)
}

function validate(data) {
  if (!data || typeof data !== 'object') fail('the top level must be an object')
  for (const path of SOURCE_FIELDS) {
    const value = path.split('.').reduce((node, key) => node?.[key], data.source)
    if (typeof value !== 'string' || value === '') fail(`source.${path} is missing or empty`)
  }
  for (const sex of SEXES) {
    if (!/^[0-9a-f]{64}$/.test(data.source.sha256[sex])) {
      fail(`source.sha256.${sex} is not a SHA-256 hex digest`)
    }
  }
  const { distancesM } = data
  if (!Array.isArray(distancesM) || distancesM.length !== DISTANCE_COUNT) {
    fail(`distancesM must list ${DISTANCE_COUNT} distances`)
  }
  PUBLISHED_DISTANCES_M.forEach((expected, i) => {
    if (distancesM[i] !== expected) {
      fail(`distancesM[${i}] is ${show(distancesM[i])}; the published distance is ${expected}`)
    }
  })
  for (const sex of SEXES) {
    const table = data[sex]
    if (!table || typeof table !== 'object') fail(`the "${sex}" table is missing`)
    const count = Object.keys(table).length
    if (count !== LAST_AGE - FIRST_AGE + 1) {
      fail(`the "${sex}" table has ${count} ages; expected ${FIRST_AGE} to ${LAST_AGE}`)
    }
    for (let age = FIRST_AGE; age <= LAST_AGE; age++) {
      const row = table[String(age)]
      if (!Array.isArray(row)) fail(`${sex} age ${age} is missing`)
      if (row.length !== DISTANCE_COUNT) {
        fail(`${sex} age ${age} has ${row.length} values; expected ${DISTANCE_COUNT}`)
      }
      row.forEach((s, i) => {
        if (!Number.isInteger(s) || s <= 0) {
          fail(`${sex} age ${age}, distance ${i + 1}: ${show(s)} is not positive whole seconds`)
        }
      })
    }
  }
}

function header(source) {
  return [
    '// Generated by packages/core/scripts/build-road-standards.mjs. Do not edit by hand.',
    '//',
    '// USATF road age standards, 2025 (approved by Masters Long Distance Running of USATF).',
    `// Compiled by ${source.compiled}.`,
    `// Licence: ${source.licence}.`,
    '//',
    '// Provenance, in order. Each step reproduces the next. Repository:',
    `// ${source.repository} at commit ${source.commit}`,
    `// (${source.commitDate}), folder "${source.folder}".`,
    `// 1. Download ${source.urls.male}`,
    `//      SHA-256 ${source.sha256.male}`,
    `//    and ${source.urls.female}`,
    `//      SHA-256 ${source.sha256.female}`,
    '// 2. python3 -I packages/core/scripts/extract-road-standards.py MaleRoadStd2025.xlsx \\',
    '//      FemaleRoadStd2025.xlsx > road-standards.json',
    '// 3. node packages/core/scripts/build-road-standards.mjs road-standards.json',
    '//',
    '// Each table has one line per age, 5 to 100, in order. Each number is the age-standard time',
    '// in whole seconds for the matching entry of ROAD_DISTANCES_M.',
    '//',
    '// Known source anomalies, kept exactly as published:',
    ...ANOMALIES.map((line) => `// ${line}`),
  ].join('\n')
}

/** One text line per age, from age 5 to 100: the space-separated seconds for each distance. */
function ageLines(data, sex) {
  const rows = []
  for (let age = FIRST_AGE; age <= LAST_AGE; age++) {
    rows.push(data[sex][String(age)].join(' '))
  }
  return rows
}

/**
 * SHA-256 of the male then female age lines. roadStandards.test.ts recomputes it from the parsed
 * numbers, so a hand edit of the tables fails until the file is regenerated.
 */
function tableChecksum(data) {
  const text = ['male', ...ageLines(data, 'male'), 'female', ...ageLines(data, 'female')].join('\n')
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function checksumBlock(data) {
  return [
    '/** SHA-256 of the age tables, recorded by the generator and checked by the tests. */',
    `export const ROAD_STANDARDS_SHA256 = '${tableChecksum(data)}'`,
  ].join('\n')
}

function distancesBlock(distancesM) {
  return [
    '/** Road distances in metres, ascending. Each table row lists its seconds in this order. */',
    `export const ROAD_DISTANCES_M: readonly number[] = [${distancesM.join(', ')}]`,
  ].join('\n')
}

function tableBlock(name, data, sex) {
  return [`const ${name} = \``, ...ageLines(data, sex), '`'].join('\n')
}

function render(data) {
  return [
    header(data.source),
    '',
    checksumBlock(data),
    '',
    distancesBlock(data.distancesM),
    '',
    tableBlock('MALE_TABLE', data, 'male'),
    '',
    tableBlock('FEMALE_TABLE', data, 'female'),
    '',
    PARSER,
    '',
    '/** Male age-standard seconds: row 0 is age 5 and row 95 is age 100. */',
    'export const ROAD_STANDARDS_MALE: number[][] = parseTable(MALE_TABLE)',
    '/** Female age-standard seconds: row 0 is age 5 and row 95 is age 100. */',
    'export const ROAD_STANDARDS_FEMALE: number[][] = parseTable(FEMALE_TABLE)',
    '',
  ].join('\n')
}

async function main() {
  const input = process.argv[2]
  if (!input) {
    throw new Error(
      'usage: node packages/core/scripts/build-road-standards.mjs <road-standards.json>',
    )
  }
  let data
  try {
    data = JSON.parse(await readFile(input, 'utf8'))
  } catch (error) {
    throw new Error(`could not read ${input} as JSON: ${error.message}`, { cause: error })
  }
  validate(data)
  const options = (await resolveConfig(OUTPUT)) ?? {}
  const text = await format(render(data), { ...options, filepath: OUTPUT })
  await writeFile(OUTPUT, text)
  console.log(`wrote ${OUTPUT}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
