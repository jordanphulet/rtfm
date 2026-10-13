import net from "node:net";
import { describe, expect, it } from "vitest";
import viteConfig from "./vite.config.ts";
import { throwIfTestReachedOutside } from "./vitest.setup.ts";

const TEST_NET_ADDRESS = "192.0.2.1";
const OTHER_TEST_NET_ADDRESS = "198.51.100.1";

function expectBlocked(...targets: string[]): void {
  let error: unknown;
  try {
    throwIfTestReachedOutside();
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain(`beyond this machine: ${targets.join(", ")}.`);
}

describe("vitest.setup.ts", () => {
  it("runs before every test file", () => {
    expect(viteConfig.test?.setupFiles).toEqual(["./vitest.setup.ts"]);
  });

  it("has every Node process the tests run preload loopback-only.ts", () => {
    const preload = `--import=${new URL("./loopback-only.ts", import.meta.url).href}`;
    expect(viteConfig.test?.env?.NODE_OPTIONS?.split(" ")).toContain(preload);
  });

  it("fails the test even when the code under test swallows the error", async () => {
    await fetch(`http://${TEST_NET_ADDRESS}/`).catch(() => {});
    expectBlocked(`a connection to ${TEST_NET_ADDRESS}`);
  });

  it("names every target the test tried to reach, in order", async () => {
    net.connect(80, TEST_NET_ADDRESS).on("error", () => {});
    net.connect(80, OTHER_TEST_NET_ADDRESS).on("error", () => {});
    expectBlocked(`a connection to ${TEST_NET_ADDRESS}`, `a connection to ${OTHER_TEST_NET_ADDRESS}`);
  });
});
