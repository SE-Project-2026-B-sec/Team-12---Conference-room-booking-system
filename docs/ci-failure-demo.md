# CRBS-38 / [CD-2] CI Failure Demonstration Evidence

## Overview
This document records the verification evidence for Jira task **CRBS-38** (`[CD-2] Demo failing-test branch that blocks deployment; capture evidence (run links, commit IDs)`), fulfilling the verification criteria of **TC20** and **NFR05**.

The objective of this demonstration was to prove that:
1. An intentional, deterministic automated test regression causes the GitHub Actions CI workflow to fail.
2. The failing CI check flags the pull request as unstable and prevents unverified code from being merged into `main`.
3. The failing CI workflow protects downstream continuous delivery (`.github/workflows/cd.yml`), where image building and deployment depend strictly on passing CI (`needs: ci`).
4. The demonstration is conducted in isolation on a feature branch without polluting `main`.

---

## Historical Demonstration Evidence

- **Jira Task**: CRBS-38 / [CD-2]
- **Demonstration Branch**: `CRBS-38-failing-test-demo`
- **Demonstration Commit SHA**: [`a1e1f1f96e8c427b516cac181053516f37a020dd`](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/commit/a1e1f1f96e8c427b516cac181053516f37a020dd)
- **Pull Request**: [PR #39: CRBS-38: Demonstrate failing test blocks CI](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/pull/39)
- **GitHub Actions CI Workflow Run**: [Run #42410741338](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42410741338)
  - **Overall Conclusion**: `failure` (exit code 1)
  - **Server Job**: [Failed — Job #128518114279](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42410741338/job/128518114279)
  - **Client Job**: [Passed — Job #128518113936](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42410741338/job/128518113936)

---

## Test Failure Details

The deliberate failure was introduced in a dedicated test file `server/tests/ci-failure-demo.test.ts`:
```ts
import { describe, expect, it } from "vitest";

describe("CRBS-38 / [CD-2] Failing Test Demonstration (TC20 / NFR05)", () => {
  it("deliberately fails to verify that CI blocks pull request merge and prevents deployment", () => {
    // Deliberate failure assertion for TC20 / NFR05 CD verification:
    // Proves that an automated test regression fails the CI workflow and blocks merging into main.
    expect(true).toBe(false);
  });
});
```

### CI Step Execution in the Server Job:
1. `Install dependencies`: Completed (`npm ci`)
2. `Generate Prisma client`: Completed (`npx prisma generate`)
3. `Run linter`: Completed (`npm run lint` — 0 errors)
4. `Run TypeScript build`: Completed (`npm run build` — 0 errors)
5. `Prepare test database`: Completed (`npm run test:db:prepare`)
6. `Run test suite`: **Failed** (`npm test`)

### GitHub Actions Console Log:
```text
FAIL  tests/ci-failure-demo.test.ts > CRBS-38 / [CD-2] Failing Test Demonstration (TC20 / NFR05) > deliberately fails to verify that CI blocks pull request merge and prevents deployment
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ tests/ci-failure-demo.test.ts:7:18
      5|     // Deliberate failure assertion for TC20 / NFR05 CD verification:
      6|     // Proves that an automated test regression fails the CI workflow …
      7|     expect(true).toBe(false);
       |                  ^
      8|   });
      9| });
```

---

## Pre-Merge Cleanup & Restoration

To ensure that `main` remains 100% green and free of dummy test failures upon merging:
1. The temporary test file `server/tests/ci-failure-demo.test.ts` was deleted.
2. All 13 production server test suites (214 tests) and all client test suites pass cleanly.
3. Server linter (`npm run lint`) and build (`npm run build`) pass with zero errors.
4. The historical GitHub Actions run [#42410741338](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42410741338) remains permanently recorded as verification evidence for course deliverables.

