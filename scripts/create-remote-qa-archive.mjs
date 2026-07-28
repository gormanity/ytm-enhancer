import { unlink, writeFile } from "node:fs/promises";
import process from "node:process";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { TextDecoder } from "node:util";
import { gzipSync } from "node:zlib";

const BLOCK_SIZE = 512;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_JJ_OUTPUT_BYTES = MAX_ARCHIVE_BYTES;
const METADATA_FIELD_COUNT = 4;
const METADATA_BATCH_SIZE = 128;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

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

function fail() {
  throw new Error("Archive creation failed.");
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function isPrivatePath(filePath) {
  const segments = filePath.toLowerCase().split("/");
  const fileName = segments.at(-1);

  if (segments.some((segment) => privateDirectoryNames.has(segment))) {
    return true;
  }
  if (
    fileName === ".envrc" ||
    /^\.env(?:\.|$)/u.test(fileName) ||
    fileName.startsWith(".remote-qa.env")
  ) {
    return true;
  }
  if (/^id_(?:dsa|ecdsa|ed25519|rsa)(?:\.pub)?$/u.test(fileName)) {
    return true;
  }
  if (privateFileNames.has(fileName)) {
    return true;
  }

  const extensionIndex = fileName.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex) : "";
  return privateExtensions.has(extension);
}

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function validateManifestPath(filePath) {
  if (
    filePath.length === 0 ||
    filePath.startsWith("/") ||
    filePath.startsWith("-") ||
    filePath.includes("\\") ||
    filePath.includes(":") ||
    filePath.includes("\0") ||
    hasControlCharacters(filePath) ||
    filePath.normalize("NFC") !== filePath
  ) {
    fail();
  }

  const segments = filePath.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        /[. ]$/u.test(segment) ||
        windowsReservedName.test(segment),
    ) ||
    isPrivatePath(filePath)
  ) {
    fail();
  }
}

function parseManifest(input) {
  if (input.length === 0 || input.at(-1) !== 0) {
    fail();
  }

  const decoded = textDecoder.decode(input);
  const paths = decoded.split("\0");
  paths.pop();
  if (paths.length === 0) {
    fail();
  }

  const seenPaths = new Set();
  const seenWindowsPaths = new Set();
  for (const filePath of paths) {
    validateManifestPath(filePath);
    const windowsPath = filePath.toLowerCase();
    if (seenPaths.has(filePath) || seenWindowsPaths.has(windowsPath)) {
      fail();
    }
    seenPaths.add(filePath);
    seenWindowsPaths.add(windowsPath);
  }
  return paths;
}

function runJj(operation, args) {
  const result = spawnSync(
    "jj",
    [`--at-operation=${operation}`, "--color=never", "--no-pager", ...args],
    {
      encoding: null,
      maxBuffer: MAX_JJ_OUTPUT_BYTES,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    fail();
  }
  return result.stdout;
}

function parseSingleNulField(output) {
  if (output.length < 2 || output.at(-1) !== 0) {
    fail();
  }
  const fields = textDecoder.decode(output).split("\0");
  fields.pop();
  if (fields.length !== 1) {
    fail();
  }
  return fields[0];
}

function pinRepositoryState(operation, revision) {
  if (
    !/^[0-9a-f]{64,128}$/u.test(operation) ||
    !/^[0-9a-f]{40,64}$/u.test(revision)
  ) {
    fail();
  }

  const resolvedOperation = parseSingleNulField(
    runJj(operation, [
      "operation",
      "log",
      "--ignore-working-copy",
      "--no-graph",
      "--limit=1",
      "-T",
      'id ++ "\\0"',
    ]),
  );
  const resolvedRevision = parseSingleNulField(
    runJj(operation, [
      "log",
      "--ignore-working-copy",
      "--no-graph",
      "-r",
      revision,
      "-T",
      'commit_id ++ "\\0"',
    ]),
  );
  if (resolvedOperation !== operation || resolvedRevision !== revision) {
    fail();
  }
}

function rootFileFileset(filePath) {
  return `root-file:${JSON.stringify(filePath)}`;
}

function collectMetadata(operation, revision, paths) {
  const metadata = new Map();
  const requestedPaths = new Set(paths);
  const metadataTemplate =
    'path ++ "\\0" ++ file_type ++ "\\0" ++ executable ++ "\\0" ++ conflict ++ "\\0"';

  for (let index = 0; index < paths.length; index += METADATA_BATCH_SIZE) {
    const batch = paths.slice(index, index + METADATA_BATCH_SIZE);
    const output = runJj(operation, [
      "file",
      "list",
      "--ignore-working-copy",
      "-r",
      revision,
      "-T",
      metadataTemplate,
      ...batch.map(rootFileFileset),
    ]);
    if (output.length === 0 || output.at(-1) !== 0) {
      fail();
    }

    const fields = textDecoder.decode(output).split("\0");
    fields.pop();
    if (fields.length % METADATA_FIELD_COUNT !== 0) {
      fail();
    }
    for (let field = 0; field < fields.length; field += METADATA_FIELD_COUNT) {
      const [filePath, fileType, executable, conflict] = fields.slice(
        field,
        field + METADATA_FIELD_COUNT,
      );
      if (
        !requestedPaths.has(filePath) ||
        metadata.has(filePath) ||
        fileType !== "file" ||
        !["true", "false"].includes(executable) ||
        conflict !== "false"
      ) {
        fail();
      }
      metadata.set(filePath, { executable: executable === "true" });
    }
  }

  if (
    metadata.size !== paths.length ||
    paths.some((filePath) => !metadata.has(filePath))
  ) {
    fail();
  }
  return metadata;
}

function readRevisionFile(operation, revision, filePath) {
  return runJj(operation, [
    "file",
    "show",
    "--ignore-working-copy",
    "-r",
    revision,
    "-T",
    "",
    rootFileFileset(filePath),
  ]);
}

function splitUstarPath(filePath) {
  const encodedPath = Buffer.from(filePath, "utf-8");
  if (encodedPath.length <= 100) {
    return { name: encodedPath, prefix: Buffer.alloc(0) };
  }

  let separatorIndex = filePath.lastIndexOf("/");
  while (separatorIndex > 0) {
    const prefix = Buffer.from(filePath.slice(0, separatorIndex), "utf-8");
    const name = Buffer.from(filePath.slice(separatorIndex + 1), "utf-8");
    if (prefix.length <= 155 && name.length <= 100) {
      return { name, prefix };
    }
    separatorIndex = filePath.lastIndexOf("/", separatorIndex - 1);
  }
  fail();
}

function writeField(header, offset, length, value) {
  if (value.length > length) {
    fail();
  }
  value.copy(header, offset);
}

function octalField(value, length) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail();
  }
  const octal = value.toString(8);
  if (octal.length > length - 1) {
    fail();
  }
  return Buffer.from(`${octal.padStart(length - 1, "0")}\0`, "ascii");
}

function createUstarHeader(filePath, size, executable) {
  const header = Buffer.alloc(BLOCK_SIZE);
  const { name, prefix } = splitUstarPath(filePath);
  writeField(header, 0, 100, name);
  writeField(
    header,
    100,
    8,
    Buffer.from(executable ? "0000755\0" : "0000644\0", "ascii"),
  );
  writeField(header, 108, 8, Buffer.from("0000000\0", "ascii"));
  writeField(header, 116, 8, Buffer.from("0000000\0", "ascii"));
  writeField(header, 124, 12, octalField(size, 12));
  writeField(header, 136, 12, Buffer.from("00000000000\0", "ascii"));
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeField(header, 257, 6, Buffer.from("ustar\0", "ascii"));
  writeField(header, 263, 2, Buffer.from("00", "ascii"));
  writeField(header, 265, 32, Buffer.from("root\0", "ascii"));
  writeField(header, 297, 32, Buffer.from("root\0", "ascii"));
  writeField(header, 329, 8, Buffer.from("0000000\0", "ascii"));
  writeField(header, 337, 8, Buffer.from("0000000\0", "ascii"));
  writeField(header, 345, 155, prefix);

  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }
  const encodedChecksum = checksum.toString(8).padStart(6, "0");
  if (encodedChecksum.length !== 6) {
    fail();
  }
  writeField(header, 148, 8, Buffer.from(`${encodedChecksum}\0 `, "ascii"));
  return header;
}

function createUstarArchive(operation, revision, paths, metadata) {
  const chunks = [];
  let archiveSize = BLOCK_SIZE * 2;

  for (const filePath of paths) {
    const content = readRevisionFile(operation, revision, filePath);
    const paddingSize =
      (BLOCK_SIZE - (content.length % BLOCK_SIZE)) % BLOCK_SIZE;
    archiveSize += BLOCK_SIZE + content.length + paddingSize;
    if (archiveSize > MAX_ARCHIVE_BYTES) {
      fail();
    }

    chunks.push(
      createUstarHeader(
        filePath,
        content.length,
        metadata.get(filePath).executable,
      ),
      content,
    );
    if (paddingSize > 0) {
      chunks.push(Buffer.alloc(paddingSize));
    }
  }
  chunks.push(Buffer.alloc(BLOCK_SIZE * 2));
  return Buffer.concat(chunks, archiveSize);
}

function createCanonicalGzip(tarArchive) {
  const compressed = gzipSync(tarArchive, { level: 6, mtime: 0 });
  if (
    compressed.length < 18 ||
    compressed[0] !== 0x1f ||
    compressed[1] !== 0x8b ||
    compressed[2] !== 8 ||
    compressed[3] !== 0 ||
    compressed.subarray(4, 8).some((byte) => byte !== 0) ||
    compressed[8] !== 0
  ) {
    fail();
  }
  compressed[9] = 255;
  return compressed;
}

let archivePath = "";
try {
  if (process.argv.length !== 5) {
    fail();
  }
  [, , archivePath] = process.argv;
  const operation = process.argv[3];
  const revision = process.argv[4];
  if (archivePath.length === 0) {
    fail();
  }

  await unlink(archivePath).catch(() => {});
  const paths = parseManifest(await readStandardInput());
  pinRepositoryState(operation, revision);
  const metadata = collectMetadata(operation, revision, paths);
  const tarArchive = createUstarArchive(operation, revision, paths, metadata);
  await writeFile(archivePath, createCanonicalGzip(tarArchive), {
    flag: "wx",
    mode: 0o600,
  });
} catch {
  if (archivePath.length > 0) {
    await unlink(archivePath).catch(() => {});
  }
  process.stderr.write("Windows QA source archive creation failed.\n");
  process.exitCode = 1;
}
