import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

import initializeSnapshot from "../src/index.js";
import { expect } from "expect";

initializeSnapshot(import.meta.url);

test("a snapshot", async () => {
  expect("Lorem ipsum dolor sit amet,").toMatchSnapshot();
  expect("consectetur adipiscing elit,").toMatchSnapshot();

  const snapshotFile = path.resolve(
    path.dirname(import.meta.url.replace("file://", "")),
    "snapshots/integration.test.js.md"
  );

  const snapshotContent = await fs.readFile(snapshotFile, "utf-8");
  expect(snapshotContent).toContain("Lorem ipsum dolor sit");
});
