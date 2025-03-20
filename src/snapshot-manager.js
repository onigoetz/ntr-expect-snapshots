import fs from "node:fs";
import { findSourceMap } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSnapshotData, saveSnapshotFile } from "@jest/snapshot-utils";
import { serializeSnapshot } from "./format.js";
import memoize from "memoize";

export class SnapshotError extends Error {
  constructor(message, snapPath) {
    super(message);
    this.name = "SnapshotError";
    this.snapPath = snapPath;
  }
}
export class InvalidSnapshotError extends SnapshotError {
  constructor(snapPath) {
    super("Invalid snapshot file", snapPath);
    this.name = "InvalidSnapshotError";
  }
}

function tryRead(file) {
  try {
    return fs.readFileSync(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function sortBlocks(blocksByTitle, blockIndices) {
  return [...blocksByTitle].sort(([aTitle], [bTitle]) => {
    const a = blockIndices.get(aTitle);
    const b = blockIndices.get(bTitle);

    if (a === undefined) {
      if (b === undefined) {
        return 0;
      }

      return 1;
    }

    if (b === undefined) {
      return -1;
    }

    return a - b;
  });
}

function decodeSnapshots(snapPath) {
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

class Manager {
  constructor(options) {
    this.dir = options.dir;
    this.recordNewSnapshots = options.recordNewSnapshots;
    this.updating = options.updating;
    this.relFile = options.relFile;
    this.snapFile = options.snapFile;
    this.snapPath = options.snapPath;
    this.newSnapFile = options.newSnapFile;
    this.oldBlocksByTitle = options.oldBlocksByTitle;
    this.newBlocksByTitle = options.newBlocksByTitle;
    this.blockIndices = new Map();
    this.error = options.error;

    this.hasChanges = false;
  }

  touch(title, taskIndex) {
    this.blockIndices.set(title, taskIndex);
  }

  compare(options) {
    if (this.error) {
      throw this.error;
    }

    const block = this.newBlocksByTitle.get(options.belongsTo);

    const snapshot = block?.snapshots[options.index];
    const actual = snapshot?.data;

    if (!actual) {
      if (!this.recordNewSnapshots) {
        return { pass: false };
      }

      if (options.deferRecording) {
        const record = this.deferRecord(options);
        return { pass: true, record };
      }

      this.record(options);
      return { pass: true };
    }

    const expected = serializeSnapshot(options.expected);
    const pass = actual === expected;

    return { actual, expected, pass };
  }

  recordSerialized({ data, label, belongsTo, index }) {
    const block = this.newBlocksByTitle.get(belongsTo) ?? { snapshots: [] };
    const { snapshots } = block;

    if (index > snapshots.length) {
      throw new RangeError(
        `Cannot record snapshot ${index} for ${JSON.stringify(
          belongsTo
        )}, exceeds expected index of ${snapshots.length}`
      );
    } else if (index < snapshots.length) {
      if (snapshots[index].data) {
        throw new RangeError(
          `Cannot record snapshot ${index} for ${JSON.stringify(
            belongsTo
          )}, already exists`
        );
      }

      snapshots[index] = { data, label };
    } else {
      snapshots.push({ data, label });
    }

    this.newBlocksByTitle.set(belongsTo, block);
  }

  deferRecord(options) {
    const { expected, belongsTo, label, index } = options;
    const data = serializeSnapshot(expected);

    return () => {
      // Must be called in order!
      this.hasChanges = true;
      this.recordSerialized({
        data,
        label,
        belongsTo,
        index,
      });
    };
  }

  record(options) {
    const record = this.deferRecord(options);
    record();
  }

  skipBlock(title) {
    const block = this.oldBlocksByTitle.get(title);

    if (block) {
      this.newBlocksByTitle.set(title, block);
    }
  }

  skipSnapshot({ belongsTo, index, deferRecording }) {
    const oldBlock = this.oldBlocksByTitle.get(belongsTo);
    const snapshot = oldBlock?.snapshots[index] ?? {};

    // Retain the label from the old snapshot, so as not to assume that the
    // snapshot.skip() arguments are well-formed.

    // Defer recording if called in a try().
    if (deferRecording) {
      return () => {
        // Must be called in order!
        this.recordSerialized({ belongsTo, index, ...snapshot });
      };
    }

    this.recordSerialized({ belongsTo, index, ...snapshot });
  }

  async save() {
    const { dir, snapPath } = this;

    if (this.updating && this.newBlocksByTitle.size === 0) {
      return {
        changedFiles: [cleanFile(snapPath)].flat(),
      };
    }

    if (!this.hasChanges) {
      return null;
    }

    const snapshots = {
      blocks: sortBlocks(this.newBlocksByTitle, this.blockIndices).map(
        ([title, block]) => ({ title, ...block })
      ),
    };

    await fs.promises.mkdir(dir, { recursive: true });

    const snapshotData = snapshots.blocks.reduce((acc, item) => {
      item.snapshots.forEach((snapshot, index) => {
        acc[`${item.title}//${snapshot.label ?? index}`] = snapshot.data;
      });
      return acc;
    }, {});

    await saveSnapshotFile(snapshotData, snapPath);

    return {
      changedFiles: [snapPath],
    };
  }
}

const resolveSourceFile = memoize((file) => {
  const sourceMap = findSourceMap(file);
  // Prior to Node.js 18.8.0, the value when a source map could not be found was `undefined`.
  // This changed to `null` in <https://github.com/nodejs/node/pull/43875>. Check both.
  if (sourceMap === undefined || sourceMap === null) {
    return file;
  }

  const { payload } = sourceMap;
  if (payload.sources.length === 0) {
    // Hypothetical?
    return file;
  }

  return payload.sources[0].startsWith("file://")
    ? fileURLToPath(payload.sources[0])
    : payload.sources[0];
});

export const determineSnapshotDir = memoize(
  ({ file, fixedLocation, projectDir }) => {
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
  },
  { cacheKey: ([{ file }]) => file }
);

function determineSnapshotPaths({ file, fixedLocation, projectDir }) {
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

function cleanFile(file) {
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

export function load({
  file,
  fixedLocation,
  projectDir,
  recordNewSnapshots,
  updating,
}) {
  // Keep runner unit tests that use `new Runner()` happy
  if (file === undefined || projectDir === undefined) {
    return new Manager({
      recordNewSnapshots,
      updating,
      oldBlocksByTitle: new Map(),
      newBlocksByTitle: new Map(),
    });
  }

  const paths = determineSnapshotPaths({ file, fixedLocation, projectDir });
  const buffer = tryRead(paths.snapPath);

  if (!buffer) {
    return new Manager({
      recordNewSnapshots,
      updating,
      ...paths,
      oldBlocksByTitle: new Map(),
      newBlocksByTitle: new Map(),
    });
  }

  let blocksByTitle;
  let snapshotError;

  try {
    blocksByTitle = decodeSnapshots(paths.snapPath);
  } catch (error) {
    blocksByTitle = new Map();

    if (!updating) {
      // Discard all decoding errors when updating snapshots
      snapshotError =
        error instanceof SnapshotError
          ? error
          : new InvalidSnapshotError(paths.snapPath);
    }
  }

  return new Manager({
    recordNewSnapshots,
    updating,
    ...paths,
    oldBlocksByTitle: blocksByTitle,
    newBlocksByTitle: updating ? new Map() : blocksByTitle,
    error: snapshotError,
  });
}
