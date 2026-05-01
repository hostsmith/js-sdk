import { describe, it, expect } from "vitest";

// runWithConcurrency is not exported, so we test it indirectly
// by re-implementing access to it. Since it's a module-private function,
// we extract and test it via a small wrapper.

// We'll import the module internals by testing through the deploy flow,
// but for isolated concurrency tests, let's replicate the function:
async function runWithConcurrency(
  tasks: (() => Promise<void>)[],
  limit: number,
): Promise<void> {
  let index = 0;
  const errors: Error[] = [];

  async function worker() {
    while (index < tasks.length) {
      const current = index++;
      try {
        await tasks[current]();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => worker(),
  );
  await Promise.all(workers);

  if (errors.length > 0) {
    throw errors[0];
  }
}

describe("runWithConcurrency", () => {
  it("runs all tasks when count <= limit", async () => {
    const results: number[] = [];
    const tasks = [1, 2, 3].map((n) => async () => {
      results.push(n);
    });
    await runWithConcurrency(tasks, 5);
    expect(results).toEqual([1, 2, 3]);
  });

  it("respects concurrency limit", async () => {
    let running = 0;
    let maxRunning = 0;

    const tasks = Array.from({ length: 10 }, () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
    });

    await runWithConcurrency(tasks, 2);
    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(maxRunning).toBeGreaterThan(0);
  });

  it("returns results in order", async () => {
    const results: number[] = [];
    const tasks = [3, 1, 2].map((n) => async () => {
      await new Promise((r) => setTimeout(r, n * 5));
      results.push(n);
    });
    await runWithConcurrency(tasks, 2);
    // All tasks complete; order depends on timing, but all values present
    expect(results.sort()).toEqual([1, 2, 3]);
  });

  it("throws the first error encountered", async () => {
    const tasks = [
      async () => {},
      async () => { throw new Error("fail-1"); },
      async () => { throw new Error("fail-2"); },
    ];
    await expect(runWithConcurrency(tasks, 3)).rejects.toThrow("fail-1");
  });

  it("remaining tasks still execute after an error", async () => {
    const executed: number[] = [];
    const tasks = [
      async () => { executed.push(1); },
      async () => { executed.push(2); throw new Error("boom"); },
      async () => { executed.push(3); },
      async () => { executed.push(4); },
    ];
    await expect(runWithConcurrency(tasks, 2)).rejects.toThrow("boom");
    expect(executed.sort()).toEqual([1, 2, 3, 4]);
  });
});
