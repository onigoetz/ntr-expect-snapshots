import fs from "node:fs";
import { findSourceMap } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getSnapshotData, saveSnapshotFile } from "@jest/snapshot-utils";

/**
 * Some tests are transformed, this ensures we get the original source file to base the snapshot path on.
 *
 * @param {string} file
 * @returns {string}
 */
export function resolveSourceFile(file) {
  const sourceMap = findSourceMap(file);
  // Prior to Node.js 18.8.0, the value when a source map could not be found was `undefined`.
  // This changed to `null` in <https://github.com/nodejs/node/pull/43875>. Check both.
  if (sourceMap === undefined || sourceMap === null) {
    return file.startsWith("file://") ? fileURLToPath(file) : file;
  }

  const { payload } = sourceMap;
  if (payload.sources.length === 0) {
    // Hypothetical?
    return file;
  }

  return payload.sources[0].startsWith("file://")
    ? fileURLToPath(payload.sources[0])
    : payload.sources[0];
}

export function determineSnapshotDir({ file, fixedLocation, projectDir }) {
  const testDir = path.dirname(resolveSourceFile(file));
  if (fixedLocation) {
    const relativeTestLocation = path.relative(projectDir, testDir);
    return path.join(fixedLocation, relativeTestLocation);
  }

  const parts = new Set(path.relative(projectDir, testDir).split(path.sep));
  if (parts.has("__tests__")) {
    return path.join(testDir, "__snapshots__");
  }

  if (parts.has("test") || parts.has("tests")) {
    // Accept tests, even though it's not in the default test patterns
    return path.join(testDir, "snapshots");
  }

  return testDir;
}

export function determineSnapshotPaths({ file, fixedLocation, projectDir }) {
  const dir = determineSnapshotDir({ file, fixedLocation, projectDir });
  const relFile = path.relative(projectDir, resolveSourceFile(file));
  const name = path.basename(relFile);
  const snapFile = `${name}.snap`;

  return {
    dir,
    relFile,
    snapFile,
    snapPath: path.join(dir, snapFile),
  };
}

export function tryRead(file) {
  try {
    return fs.readFileSync(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export function readSnapshotFile(snapPath) {
  const decoded = getSnapshotData(snapPath);

  // TODO : do something with "dirty" value

  const obj = new Map();
  for (const [key, value] of Object.entries(decoded.data)) {
    const [title, rawLabel] = key.split("//");
    if (!obj.has(title)) {
      obj.set(title, { snapshots: [] });
    }

    const num = parseInt(rawLabel, 10);
    const label = `${num}` === rawLabel ? undefined : rawLabel;

    obj.get(title).snapshots.push({ label, data: value });
  }

  return obj;
}

export async function writeSnapshotFile(snapPath, data) {
  await fs.promises.mkdir(this.dir, { recursive: true });

  const snapshotData = {};
  for (const [title, block] of data) {
    block.snapshots.forEach((snapshot, index) => {
      snapshotData[`${title}//${snapshot.label ?? index}`] = snapshot.data;
    });
  }

  await saveSnapshotFile(snapshotData, snapPath);
}

export function cleanFile(file) {
  try {
    fs.unlinkSync(file);
    return [file];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}
