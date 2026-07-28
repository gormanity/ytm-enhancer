import { Buffer } from "node:buffer";
import { lstat, readFile } from "node:fs/promises";
import process from "node:process";
import { TextDecoder } from "node:util";
import { gunzipSync } from "node:zlib";

const BLOCK_SIZE = 512;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const zeroBlock = Buffer.alloc(BLOCK_SIZE);

const privateDirectoryNames = new Set([
  ".agents",
  ".claude",
  ".codex",
  ".direnv",
  ".git",
  ".hg",
  ".jj",
  ".ssh",
  ".svn",
  "node_modules",
]);

const privateFileNames = new Set([
  ".envrc",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "authorized_keys",
  "claude.md",
  "credentials",
  "credentials.json",
  "known_hosts",
  "secrets.json",
  "service-account.json",
]);

const privateExtensions = new Set([
  ".cer",
  ".crt",
  ".der",
  ".jks",
  ".kdbx",
  ".key",
  ".keystore",
  ".p12",
  ".pem",
  ".pfx",
  ".ppk",
]);

const windowsReservedName =
  /^(?:aux|clock\$|com[1-9¹²³]|con|conin\$|conout\$|lpt[1-9¹²³]|nul|prn)(?:\.|$)/iu;

const crc32Table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return value >>> 0;
});

function fail() {
  throw new Error("Archive validation failed.");
}

function isAllZero(buffer) {
  return buffer.every((byte) => byte === 0);
}

function readTextField(header, offset, length) {
  const field = header.subarray(offset, offset + length);
  const terminator = field.indexOf(0);
  const content = terminator >= 0 ? field.subarray(0, terminator) : field;
  if (terminator >= 0 && !isAllZero(field.subarray(terminator))) {
    fail();
  }
  return textDecoder.decode(content);
}

function expectBytes(header, offset, expected) {
  if (!header.subarray(offset, offset + expected.length).equals(expected)) {
    fail();
  }
}

function parseCanonicalOctal(header, offset, length) {
  const field = header.subarray(offset, offset + length);
  if (
    field.at(-1) !== 0 ||
    !field.subarray(0, -1).every((byte) => byte >= 0x30 && byte <= 0x37)
  ) {
    fail();
  }
  const value = Number.parseInt(field.subarray(0, -1).toString("ascii"), 8);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail();
  }
  return value;
}

function splitUstarPath(filePath) {
  const encodedPath = Buffer.from(filePath, "utf-8");
  if (encodedPath.length <= 100) {
    return { name: filePath, prefix: "" };
  }

  let separatorIndex = filePath.lastIndexOf("/");
  while (separatorIndex > 0) {
    const prefix = filePath.slice(0, separatorIndex);
    const name = filePath.slice(separatorIndex + 1);
    if (
      Buffer.byteLength(prefix, "utf-8") <= 155 &&
      Buffer.byteLength(name, "utf-8") <= 100
    ) {
      return { name, prefix };
    }
    separatorIndex = filePath.lastIndexOf("/", separatorIndex - 1);
  }
  fail();
}

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function validateArchivePath(filePath) {
  if (
    filePath.length === 0 ||
    filePath.startsWith("/") ||
    filePath.startsWith("-") ||
    filePath.includes("\\") ||
    filePath.includes(":") ||
    hasControlCharacters(filePath) ||
    filePath.normalize("NFC") !== filePath
  ) {
    fail();
  }
  const segments = filePath.toLowerCase().split("/");
  const fileName = segments.at(-1);
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        /[. ]$/u.test(segment) ||
        windowsReservedName.test(segment) ||
        privateDirectoryNames.has(segment),
    ) ||
    fileName === ".envrc" ||
    /^\.env(?:\.|$)/u.test(fileName) ||
    fileName.startsWith(".remote-qa.env") ||
    /^id_(?:dsa|ecdsa|ed25519|rsa)(?:\.pub)?$/u.test(fileName) ||
    privateFileNames.has(fileName)
  ) {
    fail();
  }

  const extensionIndex = fileName.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex) : "";
  if (privateExtensions.has(extension)) {
    fail();
  }
}

function validateHeader(header, seenPaths) {
  const storedChecksum = header.subarray(148, 156);
  if (
    storedChecksum[6] !== 0 ||
    storedChecksum[7] !== 0x20 ||
    !storedChecksum.subarray(0, 6).every((byte) => byte >= 0x30 && byte <= 0x37)
  ) {
    fail();
  }
  const checksumHeader = Buffer.from(header);
  checksumHeader.fill(0x20, 148, 156);
  let actualChecksum = 0;
  for (const byte of checksumHeader) {
    actualChecksum += byte;
  }
  if (
    Number.parseInt(storedChecksum.subarray(0, 6).toString("ascii"), 8) !==
    actualChecksum
  ) {
    fail();
  }

  const name = readTextField(header, 0, 100);
  const prefix = readTextField(header, 345, 155);
  const filePath = prefix.length > 0 ? `${prefix}/${name}` : name;
  validateArchivePath(filePath);
  const canonicalPath = splitUstarPath(filePath);
  if (canonicalPath.name !== name || canonicalPath.prefix !== prefix) {
    fail();
  }
  const windowsPath = filePath.toLowerCase();
  if (seenPaths.has(windowsPath)) {
    fail();
  }
  seenPaths.add(windowsPath);

  const mode = header.subarray(100, 108).toString("ascii");
  if (mode !== "0000644\0" && mode !== "0000755\0") {
    fail();
  }
  expectBytes(header, 108, Buffer.from("0000000\0", "ascii"));
  expectBytes(header, 116, Buffer.from("0000000\0", "ascii"));
  const size = parseCanonicalOctal(header, 124, 12);
  expectBytes(header, 136, Buffer.from("00000000000\0", "ascii"));
  if (header[156] !== "0".charCodeAt(0)) {
    fail();
  }
  if (!isAllZero(header.subarray(157, 257))) {
    fail();
  }
  expectBytes(header, 257, Buffer.from("ustar\0", "ascii"));
  expectBytes(header, 263, Buffer.from("00", "ascii"));
  if (
    readTextField(header, 265, 32) !== "root" ||
    readTextField(header, 297, 32) !== "root"
  ) {
    fail();
  }
  expectBytes(header, 329, Buffer.from("0000000\0", "ascii"));
  expectBytes(header, 337, Buffer.from("0000000\0", "ascii"));
  if (!isAllZero(header.subarray(500, BLOCK_SIZE))) {
    fail();
  }
  return size;
}

function validateTar(tarArchive) {
  if (
    tarArchive.length < BLOCK_SIZE * 3 ||
    tarArchive.length % BLOCK_SIZE !== 0
  ) {
    fail();
  }

  const seenPaths = new Set();
  let offset = 0;
  while (offset + BLOCK_SIZE * 2 < tarArchive.length) {
    const header = tarArchive.subarray(offset, offset + BLOCK_SIZE);
    if (header.equals(zeroBlock)) {
      break;
    }
    const size = validateHeader(header, seenPaths);
    const paddedSize = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
    const contentStart = offset + BLOCK_SIZE;
    const nextHeader = contentStart + paddedSize;
    if (nextHeader + BLOCK_SIZE * 2 > tarArchive.length) {
      fail();
    }
    if (
      paddedSize > size &&
      !isAllZero(tarArchive.subarray(contentStart + size, nextHeader))
    ) {
      fail();
    }
    offset = nextHeader;
  }

  if (
    seenPaths.size === 0 ||
    offset + BLOCK_SIZE * 2 !== tarArchive.length ||
    !tarArchive.subarray(offset).equals(Buffer.alloc(BLOCK_SIZE * 2))
  ) {
    fail();
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validateGzip(gzipArchive) {
  if (
    gzipArchive.length < 18 ||
    gzipArchive[0] !== 0x1f ||
    gzipArchive[1] !== 0x8b ||
    gzipArchive[2] !== 8 ||
    gzipArchive[3] !== 0 ||
    !isAllZero(gzipArchive.subarray(4, 8)) ||
    gzipArchive[8] !== 0 ||
    gzipArchive[9] !== 255
  ) {
    fail();
  }

  const tarArchive = gunzipSync(gzipArchive, {
    maxOutputLength: MAX_ARCHIVE_BYTES,
  });
  const trailer = gzipArchive.subarray(-8);
  if (
    trailer.readUInt32LE(0) !== crc32(tarArchive) ||
    trailer.readUInt32LE(4) !== tarArchive.length >>> 0
  ) {
    fail();
  }
  validateTar(tarArchive);
}

try {
  if (process.argv.length !== 3) {
    fail();
  }
  const archivePath = process.argv[2];
  const metadata = await lstat(archivePath);
  if (
    !metadata.isFile() ||
    metadata.nlink !== 1 ||
    metadata.size < 18 ||
    metadata.size > MAX_ARCHIVE_BYTES
  ) {
    fail();
  }
  validateGzip(await readFile(archivePath));
} catch {
  process.stderr.write("Windows QA source archive failed type validation.\n");
  process.exitCode = 1;
}
