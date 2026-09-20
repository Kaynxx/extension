import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  cpSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { deflateRawSync } from "node:zlib";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const packageMetadata = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const outputDirectory = path.join(root, "artifacts");
const archivePath = path.join(
  outputDirectory,
  `${packageMetadata.name}-${packageMetadata.version}.zip`,
);
const checksumPath = `${archivePath}.sha256`;
const staging = mkdtempSync(path.join(tmpdir(), "webgpu-upscaler-package-"));
const fixedDate = new Date("1980-01-01T00:00:00.000Z");

function collectFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      const relative = path.join(prefix, entry.name);
      return entry.isDirectory() ? collectFiles(absolute, relative) : [relative];
    });
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeDeterministicZip(files, destination) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.replaceAll(path.sep, "/"), "utf8");
    const source = readFileSync(path.join(staging, file));
    const compressed = deflateRawSync(source, { level: 9 });
    const checksum = crc32(source);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(source.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localRecords.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(source.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralRecords.push(centralHeader, name);
    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  writeFileSync(destination, Buffer.concat([...localRecords, centralDirectory, end]));
}

try {
  mkdirSync(outputDirectory, { recursive: true });
  rmSync(archivePath, { force: true });
  rmSync(checksumPath, { force: true });
  cpSync(path.join(root, "dist"), path.join(staging, "dist"), { recursive: true });
  for (const file of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES", "PRIVACY.md"]) {
    cpSync(path.join(root, file), path.join(staging, file));
  }
  for (const file of collectFiles(staging)) {
    const absolute = path.join(staging, file);
    const stats = statSync(absolute);
    utimesSync(absolute, fixedDate, fixedDate);
    if (!stats.isFile()) throw new Error(`Paket öğesi dosya değil: ${file}`);
  }
  const entries = collectFiles(staging);
  writeDeterministicZip(entries, archivePath);
  const digest = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
  writeFileSync(checksumPath, `${digest}  ${path.basename(archivePath)}\n`, "utf8");
  process.stdout.write(`${archivePath}\n${checksumPath}\n`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
