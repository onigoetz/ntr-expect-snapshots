import SingleTest from "./SingleTest.js";

function getTestName(testContext) {
  return testContext.name;
}

export default class TestManager {
  constructor({ isUpdatingSnapshots = false } = {}) {
    this.isUpdatingSnapshots = isUpdatingSnapshots;

    this.snapshotManager = null;
    this.snapshotCountTotal = 0;

    this.deferredSnapshotRecordings = [];

    this.knownTests = new Map();

    // Did we already display a warning
    // for an unmatched snapshot count in the current test suite?
    this.warnedForTest = false;
  }

  setSnapshotManager(snapshotManager) {
    this.snapshotManager = snapshotManager;
    this.startingSnapshotCount = Array.from(
      snapshotManager.oldBlocksByTitle.values()
    ).reduce((acc, blocks) => acc + blocks.snapshots.length, 0);
  }

  startTest(testContext) {
    const testName = getTestName(testContext);

    if (this.knownTests.has(testName)) {
      throw new Error(
        `Test ${testName} already ran, you might be using the same name within two different nested tests`
      );
    }

    this.currentTest = new SingleTest(testName, this.snapshotManager);
    this.knownTests.set(testName, this.currentTest);
  }

  endTest(testContext) {
    const testName = getTestName(testContext);
    if (this.currentTest.name !== testName) {
      throw new Error(
        `Test ${testName} ended but ${this.currentTest.name} is the current test`
      );
    }

    // Make sure we saw the right number of snapshots
    if (
      !this.currentTest.expectedSnapshotsCountMatchesActual() &&
      !this.isUpdatingSnapshots
    ) {
      this.warnedForTest = true;
      throw new Error(
        `Expected snapshot count changed, expected ${this.currentTest.expectedSnapshots} but got ${this.currentTest.actualSnapshots} snapshots`
      );
    }
  }

  async endAllTests() {
    // TODO :: detect if some tests were filtered or ran with "only" flag

    // Display a warning if some snapshots were not seen in this run
    // However it is not needed to fail if this warning was already printed for a single test
    // This is to avoid multiple warnings for the same test and should only be seen if a test has been removed
    const expectedSnapshotsCount =
      this.startingSnapshotCount + this.deferredSnapshotRecordings.length;
    const actualSnapshotsCount = this.snapshotCountTotal;
    if (
      this.expectedSnapshotsCount !== this.actualSnapshotsCount &&
      !warnedForTest &&
      !this.isUpdatingSnapshots
    ) {
      // TODO : inform user how to update snapshots

      throw new Error(
        `Expected snapshot count changed, expected ${expectedSnapshotsCount} but got ${actualSnapshotsCount} snapshots`
      );
    }

    // Record content for new snapshots
    if (this.deferredSnapshotRecordings.length > 0) {
      console.log(
        `Recording ${this.deferredSnapshotRecordings.length} snapshots`
      );
      for (const record of this.deferredSnapshotRecordings) {
        record();
      }
    }

    await this.snapshotManager.save();
  }

  compare(actual, label) {
    if (!this.snapshotManager) {
      throw new Error(
        "Snapshot manager not set, did you forget to call initSnapshot() ?"
      );
    }

    this.snapshotCountTotal++;

    const { record, ...result } = this.currentTest.compare(actual, label);
    if (record) {
      this.deferredSnapshotRecordings.push(record);
    }

    return result;
  }
}
