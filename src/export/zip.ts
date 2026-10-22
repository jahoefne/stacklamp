/**
 * ZIP archives of export files (fflate `zipSync`). STLs are stored
 * uncompressed by default (level 0): binary float data deflates poorly and
 * storing them is instant; text such as the print sheet can ask for a level.
 *
 * Core runs on the plain ES library (no TextEncoder): strings are encoded as
 * UTF-8 with fflate's `strToU8`.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';

/** Deflate level: 0 stores the file, 1 (fastest) … 9 (smallest). */
export type ZipLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface ZipEntry {
  /** Path inside the archive, e.g. `base.3mf`. */
  name: string;
  /** File contents; a string is written as UTF-8. */
  data: Uint8Array | ArrayBuffer | string;
  /** This file's level (default: the archive's). */
  level?: ZipLevel | undefined;
}

/** A modification time for ZIP entries: the ISO timestamp, or 1980-01-01 when it is not a date. */
export function zipTime(iso: string | undefined): Date {
  const d = iso ? new Date(iso) : new Date(Number.NaN);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1980 ? new Date(Date.UTC(1980, 0, 1, 12)) : d;
}

function bytesOf(data: ZipEntry['data']): Uint8Array {
  if (typeof data === 'string') return strToU8(data);
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** The bytes as a transferable ArrayBuffer, without a copy when they fill their buffer. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer } = bytes;
  if (
    buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === buffer.byteLength
  ) {
    return buffer;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * A ZIP archive of `entries`, in their order, each at its own level or
 * `level` (default 0: stored), all stamped with `mtime` (default 1980-01-01,
 * so the bytes do not depend on the clock). Throws on an empty or duplicate name.
 */
export function zipFiles(entries: readonly ZipEntry[], level: ZipLevel = 0, mtime: Date = zipTime(undefined)): ArrayBuffer {
  const files: Zippable = {};
  for (const entry of entries) {
    if (!entry.name) throw new Error('A ZIP entry needs a name');
    if (Object.hasOwn(files, entry.name)) {
      throw new Error(`Two files named ${entry.name} in one ZIP`);
    }
    files[entry.name] = [bytesOf(entry.data), { level: entry.level ?? level, mtime }];
  }
  return toArrayBuffer(zipSync(files));
}
