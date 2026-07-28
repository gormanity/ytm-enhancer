import { Buffer } from "node:buffer";
import { lstat } from "node:fs/promises";
import process from "node:process";
import { TextDecoder } from "node:util";

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
]);

const excludedSyncDirectoryNames = new Set(["node_modules"]);

const privateFileNames = new Set([
  ".envrc",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "authorized_keys",
  "credentials",
  "credentials.json",
  "known_hosts",
  "secrets.json",
  "service-account.json",
]);

const windowsReservedName =
  /^(?:aux|clock\$|com[1-9¹²³]|con|conin\$|conout\$|lpt[1-9¹²³]|nul|prn)(?:\.|$)/iu;

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

function isPrivatePath(filePath) {
  const lowerPath = filePath.toLowerCase();
  const segments = lowerPath.split("/");
  const fileName = segments.at(-1);

  if (segments.some((segment) => privateDirectoryNames.has(segment))) {
    return true;
  }
  if (/^\.env(?:\.|$)/u.test(fileName)) {
    return true;
  }
  if (fileName.startsWith(".remote-qa.env")) {
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

function isPrivateInstructionFile(filePath) {
  return filePath.split("/").at(-1).toLowerCase() === "claude.md";
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function validatePath(filePath) {
  if (
    filePath.length === 0 ||
    filePath.startsWith("/") ||
    filePath.startsWith("-") ||
    filePath.includes("\\") ||
    filePath.includes(":") ||
    filePath.includes("\0") ||
    [...filePath].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 0x1f || codePoint === 0x7f;
    }) ||
    filePath.normalize("NFC") !== filePath
  ) {
    throw new Error("Invalid manifest path.");
  }

  const segments = filePath.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        /[. ]$/u.test(segment) ||
        windowsReservedName.test(segment) ||
        excludedSyncDirectoryNames.has(segment.toLowerCase()),
    )
  ) {
    throw new Error("Invalid manifest path.");
  }
  if (isPrivatePath(filePath)) {
    throw new Error("Private manifest path.");
  }
}

try {
  const input = await readStandardInput();
  if (input.length === 0 || input.at(-1) !== 0) {
    throw new Error("Manifest is not NUL terminated.");
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const decoded = decoder.decode(input);
  const paths = decoded.split("\0");
  paths.pop();

  const allowedPaths = [];
  const seenPaths = new Set();
  const seenWindowsPaths = new Set();
  for (const filePath of paths) {
    validatePath(filePath);
    const windowsPathKey = filePath.toLowerCase();
    if (seenPaths.has(filePath) || seenWindowsPaths.has(windowsPathKey)) {
      throw new Error("Duplicate manifest path.");
    }
    seenPaths.add(filePath);
    seenWindowsPaths.add(windowsPathKey);

    if (!isPrivateInstructionFile(filePath)) {
      const metadata = await lstat(filePath);
      if (!metadata.isFile() || metadata.nlink !== 1) {
        throw new Error("Manifest path is not an independent regular file.");
      }
      allowedPaths.push(filePath);
    }
  }

  if (allowedPaths.length > 0) {
    process.stdout.write(Buffer.from(`${allowedPaths.join("\0")}\0`, "utf-8"));
  }
} catch {
  process.stderr.write("Windows QA sync manifest failed privacy validation.\n");
  process.exitCode = 1;
}
