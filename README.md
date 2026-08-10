# Node.js Test Runner - expect().toMatchSnapshot() integration

Node.js Test Runner is great, Expect is great, Snapshots are great.

But using them all together at the moment is ... not so great.

This package aims to provide an easy approach to use `.toMatchSnapshot` with Node.js Test Runner.

## Which Node.js versions is this for?

Node.js gained its test runner in **18.0.0**, but snapshot support only landed in **22.3.0**.
This package fills that gap, so it is aimed at projects that still have to support Node.js **18.0.0 up to 22.3.0**.

| Node.js version | `node:test` | Built-in snapshots | This package |
| --------------- | ----------- | ------------------ | ------------ |
| < 18.0.0        | ❌          | ❌                 | ❌           |
| 18.0.0 – 22.2.x | ✅          | ❌                 | ✅ intended  |
| >= 22.3.0       | ✅          | ✅                 | optional     |

On Node.js 22.3.0 and above you can use the built-in [`t.assert.snapshot()`](https://nodejs.org/api/test.html#context-assertsnapshotvalue-options) instead.
This package remains usable there — pick it if you prefer the `expect().toMatchSnapshot()` API or the Jest-compatible snapshot file format — but if your project only supports Node.js >= 22.3.0, the built-in support is likely all you need.

## Install

```
yarn add @onigoetz/ntr-expect-snapshot expect
```

## Usage

```javascript
import { test } from "node:test";

import initializeSnapshot from "@onigoetz/ntr-expect-snapshot";
import { expect } from "expect";

initializeSnapshot(import.meta.url);

test("a snapshot", async () => {
  const response = await fetch("http://example.com");
  const actual = await response.text();

  expect(actual).toMatchSnapshot();
});
```

### Updating snapshots

Updating snapshots is enabled if the `--test-update-snapshots` flag is passed (possible starting with Node.js 22.3.0)
or the `SNAPSHOT_UPDATE` environment variable is set to `"true"`.

On Node.js versions below 22.3.0 the flag does not exist, so `SNAPSHOT_UPDATE=true` is the only way to update snapshots.

## Shortcomings

Snapshot management is usually tightly integrated within the test runner to offer features such as partial updates when tests are skipped or removing snapshot files when they're no longer needed.

This package can't be integrated tightly with Node.js test runner and here are some things that will probably not be possible to implement:

__Remove a snapshot file if the test file is deleted__

We are only aware of the current running test files, not other test files so we don't know which other files are or are not present

__Remove a snapshot after a test is removed__

The fact that a snapshot isn't used in a test run can be due to the test being currently skipped, or tests being filtered.
For this reason we can't decide to remove all snapshots for a test at this stage.

## Credits / Previous work in the domain

The initial implementation is for most parts a fork of [AVA](https://www.npmjs.com/package/ava)'s implementation.

I also checked how other tools in the space work to build a coherent approach

- [snap-shot-core](https://www.npmjs.com/package/snap-shot-core)
- [@matteo.collina/snap](https://www.npmjs.com/package/@matteo.collina/snap)
- [jest-snapshot](https://www.npmjs.com/package/jest-snapshot)
