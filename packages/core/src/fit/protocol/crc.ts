/** Nibble table of the FIT CRC-16 (FIT SDK, Protocol section "CRC"). */
const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401,
  0x5000, 0x9c01, 0x8801, 0x4400,
] as const

function updateNibble(crc: number, nibble: number): number {
  const tmp = CRC_TABLE[crc & 0x0f]!
  const shifted = (crc >> 4) & 0x0fff
  return shifted ^ tmp ^ CRC_TABLE[nibble]!
}

/**
 * The checksum of every byte value from a zero checksum, built from the SDK's nibble table. A file is
 * checked in full on every import, so it is read a byte at a time, not a nibble at a time.
 */
const BYTE_TABLE = Uint16Array.from({ length: 256 }, (_, byte) =>
  updateNibble(updateNibble(0, byte & 0x0f), byte >> 4),
)

/** FIT CRC-16 over bytes[start, end). The trailing CRC of a file is stored little-endian. */
export function crc16(bytes: Uint8Array, start = 0, end = bytes.length, seed = 0): number {
  let crc = seed
  for (let i = start; i < end; i++) {
    crc = (crc >> 8) ^ BYTE_TABLE[(crc ^ bytes[i]!) & 0xff]!
  }
  return crc
}
