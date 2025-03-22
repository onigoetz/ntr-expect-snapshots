import test from "node:test";
import info from "ci-info";
import { expect } from "expect";
import TestManager from "./TestManager.js";
import { addSerializer } from "./format.js";
import { load } from "./snapshot-manager.js";

// Updating snapshots is enabled if the --test-update-snapshots (Possible statring with Node.js 22.3.0) flag is passed
// or the SNAPSHOT_UPDATE environment variable is set to "true"
const UPDATING_SNAPSHOTS =
	process.argv.includes("--test-update-snapshots") ||
	process.env.SNAPSHOT_UPDATE === "true";

// Automatic Recording is disabled in CI environments
const ALLOW_RECORDING = !info.isCi;

const testManager = new TestManager();

expect.addSnapshotSerializer = addSerializer;
expect.extend({
	toMatchSnapshot(actual, message) {
		const { matcherHint, printDiffOrStringify } = this.utils;

		const result = testManager.compare(actual, message);

		return {
			pass: result.pass,
			message: () => {
				const hint = matcherHint(".toMatchSnapshot", undefined, "");
				const diff = printDiffOrStringify(
					result.actual,
					result.expected,
					"Expected",
					"Received",
					true,
				);

				return `${hint}\n${diff}`;
			},
		};
	},
});

export default function initSnapshot(file) {
	const manager = load({
		file,
		projectDir: process.cwd(),
		recordNewSnapshots: ALLOW_RECORDING,
		updating: UPDATING_SNAPSHOTS,
	});

	testManager.setSnapshotManager(manager);

	test.beforeEach(async (t) => {
		testManager.startTest(t);
	});

	test.afterEach(async (t) => {
		testManager.endTest(t);
	});

	test.after(async () => {
		await testManager.endAllTests();
	});
}
