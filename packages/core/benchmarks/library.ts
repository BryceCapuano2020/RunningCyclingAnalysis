import { performance } from 'node:perf_hooks'
import { cpus } from 'node:os'
import { combine, digestActivity } from '../src/digest/index.ts'
import { DEFAULT_ATHLETE, generateActivity } from '../src/synthetic/index.ts'
import type { ActivityDigest, AthleteSettings } from '../src/types.ts'

const years = readNumber('--years=', 5)
const sessionsPerWeek = readNumber('--sessions-per-week=', 4)
const weeks = Math.max(1, Math.floor(years * 52.18))
const activityCount = weeks * sessionsPerWeek
const startMs = Date.UTC(2021, 0, 1)
const settings: AthleteSettings[] = [
  { massKg: 75, bikeMassKg: 9 },
  { massKg: 62, bikeMassKg: 12 },
  { massKg: 91, bikeMassKg: 8 },
]

function readNumber(prefix: string, fallback: number): number {
  const arg = process.argv.find((value) => value.startsWith(prefix))
  if (arg === undefined) return fallback
  const value = Number(arg.slice(prefix.length))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function memory() {
  const usage = process.memoryUsage()
  return {
    rssMiB: Math.round((usage.rss / 1024 ** 2) * 10) / 10,
    heapUsedMiB: Math.round((usage.heapUsed / 1024 ** 2) * 10) / 10,
    arrayBuffersMiB: Math.round((usage.arrayBuffers / 1024 ** 2) * 10) / 10,
    maxRssMiB: Math.round((process.resourceUsage().maxRSS / 1024) * 10) / 10,
  }
}

const digests: ActivityDigest[] = []
let totalSamples = 0
const digestCpuStart = process.cpuUsage()
const ingestionStarted = performance.now()
for (let i = 0; i < activityCount; i++) {
  const week = Math.floor(i / sessionsPerWeek)
  const weekday = (i % sessionsPerWeek) * 2
  const sport = i % 2 === 0 ? 'run' : 'ride'
  const durationS = i % 8 === 0 ? 7200 : i % 2 === 0 ? 3600 : 4500
  const activity = generateActivity(
    DEFAULT_ATHLETE,
    {
      id: `bench-${i}`,
      name: `Benchmark ${i}`,
      sport,
      startMs: startMs + (week * 7 + weekday) * 86_400_000,
      durationS,
      effort: (['easy', 'tempo', 'intervals', 'test'] as const)[i % 4]!,
      terrain: (['flat', 'rolling', 'climb'] as const)[i % 3]!,
      withPower: sport === 'ride' ? i % 5 !== 0 : undefined,
      hrGlitch: i % 13 === 0,
    },
    i + 1,
  )
  totalSamples += activity.n
  digests.push(digestActivity(activity))
}
const ingestionMs = performance.now() - ingestionStarted
const digestCpu = process.cpuUsage(digestCpuStart)

const coldCpuStart = process.cpuUsage()
const coldStart = performance.now()
combine(digests, settings[0]!)
const coldCombineMs = performance.now() - coldStart
const coldCombineCpu = process.cpuUsage(coldCpuStart)

const measured: number[][] = settings.map(() => [])
const settingsCpuStart = process.cpuUsage()
for (let round = 0; round < 5; round++) {
  for (let i = 0; i < settings.length; i++) {
    const start = performance.now()
    combine(digests, settings[i]!)
    measured[i]!.push(performance.now() - start)
  }
}
const settingsCpu = process.cpuUsage(settingsCpuStart)
const combineStats = measured.map((runs, i) => {
  const sorted = [...runs].sort((a, b) => a - b)
  return {
    massKg: settings[i]!.massKg,
    bikeMassKg: settings[i]!.bikeMassKg,
    medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]!),
    minMs: Math.round(sorted[0]!),
    maxMs: Math.round(sorted.at(-1)!),
  }
})

console.log(
  JSON.stringify(
    {
      benchmark: 'synthetic multi-year activity library',
      methodology: {
        years,
        sessionsPerWeek,
        activities: activityCount,
        samples: totalSamples,
        durations: '1 h standard run, 75 min standard ride, 2 h long session every 8th activity',
        sources: 'alternating run/ride; mostly measured power with virtual-power rides mixed in',
        digestRuns: 1,
        coldCombineRuns: 1,
        settingsCombineRuns: 5,
        memorySample: 'after digest construction and all combines; max RSS is process peak',
        runtime: process.version,
        platform: `${process.platform}/${process.arch}`,
        cpu: cpus()[0]?.model ?? 'unknown',
        logicalCpus: cpus().length,
      },
      results: {
        digestLibraryMs: Math.round(ingestionMs),
        digestCpuMs: Math.round((digestCpu.user + digestCpu.system) / 1000),
        coldCombineMs: Math.round(coldCombineMs),
        coldCombineCpuMs: Math.round((coldCombineCpu.user + coldCombineCpu.system) / 1000),
        settingsCombine: combineStats,
        settingsCombineCpuMs: Math.round((settingsCpu.user + settingsCpu.system) / 1000),
        memory: memory(),
      },
    },
    null,
    2,
  ),
)
