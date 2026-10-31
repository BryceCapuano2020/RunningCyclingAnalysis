import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseProfileWeightKg, readProfileWeightKg } from './profileCsv'

/** The columns of a Strava export's profile.csv, in its order, with synthetic values. */
const HEADER =
  'Athlete ID,Email Address,First Name,Last Name,Sex,Description,Weight,City,State,Country,Health Consent Status'
const row = (weight: string) =>
  `1,a@example.test,Ann,Example,F,"Likes, hills",${weight},Town,ST,Land,`

function fileOf(entries: Record<string, string>, name = 'export.zip'): File {
  const zipped = zipSync(
    Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])),
  )
  return new File([new Uint8Array(zipped)], name)
}

describe('parseProfileWeightKg', () => {
  it('reads the Weight column of the first row, whatever order the columns come in', () => {
    expect(parseProfileWeightKg(`${HEADER}\n${row('68.5')}\n`)).toBe(68.5)
    expect(parseProfileWeightKg('Weight,Sex\n70,M\n')).toBe(70)
    expect(parseProfileWeightKg('weight\r\n"82.1"\r\n')).toBe(82.1)
  })

  it('offers nothing for a blank, a zero, a word, or a weight outside what the app accepts', () => {
    for (const weight of ['', '0', 'n/a', '29.9', '200.1', '-70', '1e2', '7 0']) {
      expect(parseProfileWeightKg(`${HEADER}\n${row(weight)}\n`), weight).toBeNull()
    }
    expect(parseProfileWeightKg(`${HEADER}\n${row('30')}\n`)).toBe(30)
    expect(parseProfileWeightKg(`${HEADER}\n${row('200')}\n`)).toBe(200)
  })

  it('takes the figure as kilograms, as Strava writes it, with no conversion', () => {
    // Strava's profile.csv holds the weight in kg whatever units the account shows. A figure is never read as pounds: the app
    // has no way to tell, so 154 is 154 kg (and the athlete changes it in setup if it is not right).
    expect(parseProfileWeightKg(`${HEADER}\n${row('154')}\n`)).toBe(154)
    expect(parseProfileWeightKg(`${HEADER}\n${row('68.04')}\n`)).toBe(68.04)
  })

  it('offers nothing without a Weight column, a row, or well-formed text', () => {
    expect(parseProfileWeightKg('Sex,City\nF,Town\n')).toBeNull()
    expect(parseProfileWeightKg(`${HEADER}\n`)).toBeNull()
    expect(parseProfileWeightKg('')).toBeNull()
    expect(parseProfileWeightKg(`${HEADER}\n"1,2,3\n`)).toBeNull()
  })

  it('reads only the first athlete’s row', () => {
    expect(parseProfileWeightKg(`${HEADER}\n${row('')}\n${row('70')}\n`)).toBeNull()
  })
})

describe('readProfileWeightKg', () => {
  it('reads the profile at the root of a zip', async () => {
    const zip = fileOf({
      'profile.csv': `${HEADER}\n${row('71.2')}\n`,
      'activities.csv': 'Filename\n',
    })
    expect(await readProfileWeightKg(zip)).toBe(71.2)
  })

  it('takes the profile nearest the root, in a folder or not', async () => {
    const folder = fileOf({ 'export_1/profile.csv': `${HEADER}\n${row('66')}\n` })
    expect(await readProfileWeightKg(folder)).toBe(66)
    const both = fileOf({
      'export_1/clubs/profile.csv': `${HEADER}\n${row('99')}\n`,
      'export_1/profile.csv': `${HEADER}\n${row('66')}\n`,
    })
    expect(await readProfileWeightKg(both)).toBe(66)
  })

  it('offers nothing for a zip without one, a file that is not a zip, or a profile it cannot use', async () => {
    expect(await readProfileWeightKg(fileOf({ 'activities.csv': 'Filename\n' }))).toBeNull()
    expect(await readProfileWeightKg(new File([new Uint8Array([1, 2, 3])], 'run.fit'))).toBeNull()
    expect(
      await readProfileWeightKg(new File([new Uint8Array([1, 2, 3])], 'broken.zip')),
    ).toBeNull()
    expect(
      await readProfileWeightKg(fileOf({ 'profile.csv': `${HEADER}\n${row('abc')}\n` })),
    ).toBeNull()
  })
})
