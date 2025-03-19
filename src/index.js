import test from "node:test";
import { fileURLToPath } from 'node:url';
import { load } from "./snapshot-manager.js";
import { expect } from "expect";

export default function initSnapshot(testFile) {
  let testPath = testFile;
  if (testPath.startsWith('file:')) {
    testPath = fileURLToPath(testPath)
  }

  const testsRan = new Set();

  const manager = load({
    file: testPath,
    projectDir: process.cwd(),
    recordNewSnapshots: true,
    updating: false, // TODO : decide how to update
  });

  let startingSnapshotCount = Array.from(manager.oldBlocksByTitle.values())
  .reduce((acc, blocks) => acc + blocks.snapshots.length, 0);
  let snapshotCountTotal = 0;
  let snapshotCountCurrentTest = 0;
  let currentTestExpected = 0;

  let deferredSnapshotRecordings = [];

  test.beforeEach(async (t) => {
    const testName = t.name;

    currentTestExpected = manager.oldBlocksByTitle.get(testName)?.length ?? 0;
    snapshotCountCurrentTest = 0;
    let nextSnapshotIndex = 0;

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
          deferredSnapshotRecordings.push(record);
        }

        return {
          pass: result.pass,
          message: () => {
            //const formatter = manager.formatDescriptorDiff(result.actual, result.expected, {invert: true});
            //'\n' + formatter.label + '\n\n' + formatter.formatted + 
            return matcherHint(".toMatchSnapshot") + '\n' + printDiffOrStringify(
              manager.format(result.actual),
              manager.format(result.expected),
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
  });


  test.after(async () => {
    //console.log("All tests ran, found", { startingSnapshotCount, snapshotCountTotal, testFile, testsRan });

    // TODO :: detect if some tests were filtered or ran with "only" flag

    if (startingSnapshotCount === snapshotCountTotal) {
      if (deferredSnapshotRecordings.length > 0) {
        console.log("Recording deferred snapshots");
        for (const record of deferredSnapshotRecordings) {
          record();
        }
      }
    } else {
      console.log("Snapshot count changed", { currentTestExpected, snapshotCountCurrentTest });

      // TODO :: ask user if they want to update snapshots
    }


    await manager.save();
  });
};
