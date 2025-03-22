import { serializeSnapshot } from "./format.js";
import {
	cleanFile,
	determineSnapshotPaths,
	readSnapshotFile,
	tryRead,
	writeSnapshotFile,
} from "./utils.js";

class Manager {
	constructor(options) {
		this.recordNewSnapshots = options.recordNewSnapshots;
		this.updating = options.updating;
		this.snapFile = options.snapFile;
		this.snapPath = options.snapPath;
		this.oldBlocksByTitle = options.oldBlocksByTitle;
		this.newBlocksByTitle = options.newBlocksByTitle;
		this.error = options.error;

		this.hasChanges = false;
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

			this.record(options);
			return { pass: true, isNew: true };
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
					belongsTo,
				)}, exceeds expected index of ${snapshots.length}`,
			);
		}
		if (index < snapshots.length) {
			if (snapshots[index].data) {
				throw new RangeError(
					`Cannot record snapshot ${index} for ${JSON.stringify(
						belongsTo,
					)}, already exists`,
				);
			}

			snapshots[index] = { data, label };
		} else {
			snapshots.push({ data, label });
		}

		this.newBlocksByTitle.set(belongsTo, block);
	}

	record(options) {
		const { expected, belongsTo, label, index } = options;
		const data = serializeSnapshot(expected);

		// Must be called in order!
		this.hasChanges = true;
		this.recordSerialized({
			data,
			label,
			belongsTo,
			index,
		});
	}

	async save() {
		// No snapshots to save, we can remove the snapshot file
		if (this.updating && this.newBlocksByTitle.size === 0) {
			return {
				changedFiles: [cleanFile(this.snapPath)].flat(),
			};
		}

		if (!this.hasChanges) {
			return null;
		}

		await writeSnapshotFile(this.snapPath, this.newBlocksByTitle);

		return {
			changedFiles: [this.snapPath],
		};
	}
}

export function load({
	file,
	fixedLocation,
	projectDir,
	recordNewSnapshots,
	updating,
}) {
	const paths = determineSnapshotPaths({ file, fixedLocation, projectDir });
	const buffer = tryRead(paths.snapPath);

	if (!buffer) {
		// No snapshots exist yet, we start fresh
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
		blocksByTitle = readSnapshotFile(paths.snapPath);
	} catch (error) {
		blocksByTitle = new Map();

		// Discard all decoding errors when updating snapshots
		if (!updating) {
			snapshotError = new Error(`Invalid snapshot file, ${paths.snapPath}`, {
				cause: error,
			});
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
