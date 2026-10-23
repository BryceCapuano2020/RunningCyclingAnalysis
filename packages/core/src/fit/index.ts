export { DEFAULT_EXTRACT_LIMITS, extractFitFiles } from './archive'
export type {
  ExtractLimits,
  ExtractSummary,
  FitErrorHandler,
  FitFile,
  FitFileHandler,
  FitSource,
} from './archive'
export { encodeFit } from './encode'
export type { EncodeOptions } from './encode'
export { DEFAULT_PARSE_LIMITS, parseFit } from './parse'
export type { ParseLimits, ParseResult } from './parse'
export { MAX_ACTIVITY_GRID_SECONDS, resample, splitAtGaps } from './resample'
export type { RawRecord, Resampled } from './resample'
export { decodeFit } from './protocol/decode'
export type { DecodeOptions, DecodeResult, DecodedMessages } from './protocol/decode'
