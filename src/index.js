import test from "node:test";
import { fileURLToPath } from 'node:url';
import { load } from "./snapshot-manager.js";
import { expect } from "expect";
import { addSerializer } from "./format.js";

// Updating snapshots is enabled if the --test-update-snapshots (Possible statring with Node.js 22.3.0) flag is passed
// or the SNAPSHOT_UPDATE environment variable is set to "true"
const UPDATING_SNAPSHOTS = process.argv.includes("--test-update-snapshots") || process.env.SNAPSHOT_UPDATE === "true";

export default function initSnapshot(testFile) {
  let testPath = testFile;
  if (testPath.startsWith('file:')) {
    testPath = fileURLToPath(testPath)
  }

  const testsRan = new Set();

  const manager = load({
    file: testPath,
    projectDir: process.cwd(),
    recordNewSnapshots: true, // TODO :: disable on CI
    updating: UPDATING_SNAPSHOTS, 
  });

  let startingSnapshotCount = Array.from(manager.oldBlocksByTitle.values())
  .reduce((acc, blocks) => acc + blocks.snapshots.length, 0);
  let snapshotCountTotal = 0;
  let snapshotCountCurrentTest = 0;
  let currentTestExpected = 0;

  let deferredSnapshotRecordings = [];

  let warnedForTest = false;

  test.beforeEach(async (t) => {
    const testName = t.name;

    currentTestExpected = manager.oldBlocksByTitle.get(testName)?.snapshots.length ?? 0;
    snapshotCountCurrentTest = 0;
    let nextSnapshotIndex = 0;

    expect.addSnapshotSerializer = addSerializer;
    expect.extend({
      toMatchSnapshot(actual, message) {
        snapshotCountTotal++;
        snapshotCountCurrentTest++;

        const { matcherHint, printDiffOrStringify } = this.utils;

        const { record, ...result } = manager.compare({
          belongsTo: testName,
          deferRecording: true,
          expected: actual,
          index: nextSnapshotIndex++,
          label: message,
        });
        if (record) {
          // We're adding a new snapshot, the expected count should be updated
          currentTestExpected++; 
          deferredSnapshotRecordings.push(record);
        }

        return {
          pass: result.pass,
          message: () => {
            return matcherHint(".toMatchSnapshot", undefined, '') + '\n' + printDiffOrStringify(
              result.actual,
              result.expected,
              "Expected",
              "Received",
              true,
            );
          },
        }
      },
    });
  });

  test.afterEach(async (t) => {
    const testName = t.name;
    testsRan.add(testName);

    // Make sure we saw the right number of snapshots
    if (snapshotCountCurrentTest !== currentTestExpected && !UPDATING_SNAPSHOTS) {
      warnedForTest = true;
      throw new Error(`Expected snapshot count changed, expected ${currentTestExpected} but got ${snapshotCountCurrentTest} snapshots`);
    }
  });

  test.after(async () => {
    //console.log("All tests ran, found", { startingSnapshotCount, snapshotCountTotal, testFile, testsRan });

    // TODO :: detect if some tests were filtered or ran with "only" flag

    // Display a warning if some snapshots were not seen in this run
    // However it is not needed to fail if this warning was already printed for a single test
    // This is to avoid multiple warnings for the same test and should only be seen if a test has been removed
    const expectedSnapshotsCount = startingSnapshotCount + deferredSnapshotRecordings.length;
    const actualSnapshotsCount = snapshotCountTotal;
    if (expectedSnapshotsCount !== actualSnapshotsCount && !warnedForTest && !UPDATING_SNAPSHOTS) {

      // TODO : inform user how to update snapshots

      throw new Error(`Expected snapshot count changed, expected ${expectedSnapshotsCount} but got ${actualSnapshotsCount} snapshots`);
    }

    // Record content for new snapshots
    if (deferredSnapshotRecordings.length > 0) {
      console.log(`Recording ${deferredSnapshotRecordings.length} snapshots`);
      for (const record of deferredSnapshotRecordings) {
        record();
      }
    }

    await manager.save();
  });
};
