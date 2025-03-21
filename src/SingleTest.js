export default class SingleTest {
  constructor(name, snapshotManager) {
    this.name = name;
    this.snapshotManager = snapshotManager;

    this.expectedSnapshots =
      snapshotManager.oldBlocksByTitle.get(name)?.snapshots.length ?? 0;
    this.actualSnapshots = 0;
    this.nextSnapshotIndex = 0;
  }

  compare(actual, label) {
    this.actualSnapshots++;
    const { isNew, ...result } = this.snapshotManager.compare({
      belongsTo: this.name,
      expected: actual,
      index: this.nextSnapshotIndex++,
      label,
    });

    if (isNew) {
      // We're adding a new snapshot, the expected count should be updated
      this.expectedSnapshots++;
    }

    return result;
  }

  expectedSnapshotsCountMatchesActual() {
    return this.actualSnapshots === this.expectedSnapshots;
  }
}
