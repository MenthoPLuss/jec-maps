import { describe, expect, it, vi } from "vitest";

import { DatasetError, loadDataset, loadIndoorPlans } from "./client";
import { published } from "./testing";

const { core, indoor } = published();
const answer = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

describe("loadDataset", () => {
  it("returns the published dataset", async () => {
    expect(await loadDataset(undefined, answer(core))).toEqual(core);
  });

  it.each<[string, () => Promise<Response>, string]>([
    ["no connection", () => Promise.reject(new TypeError("Failed to fetch")), "offline"],
    ["no file", answer({}, 404), "missing"],
    ["a web page instead of data", async () => new Response("<html>"), "missing"],
    ["an old format", answer({ ...core, schemaVersion: 0 }), "outdated"],
    ["something else", answer([]), "outdated"],
  ])("explains %s", async (_name, fetcher, kind) => {
    await expect(loadDataset(undefined, fetcher)).rejects.toMatchObject({ kind });
  });

  it("lets a cancelled download end quietly", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = new DOMException("Aborted", "AbortError");

    await expect(loadDataset(controller.signal, () => Promise.reject(aborted))).rejects.toBe(aborted);
  });
});

describe("loadIndoorPlans", () => {
  it("returns the plans of a building", async () => {
    const fetcher = vi.fn(answer(indoor[0]));

    expect(await loadIndoorPlans(core, "demo-block-a", undefined, fetcher)).toEqual(indoor[0]);
    expect(fetcher).toHaveBeenCalledWith("/data/indoor/demo-block-a.json", { signal: undefined });
  });

  it("asks for nothing when a building has no plans", async () => {
    const fetcher = vi.fn(answer(null));

    expect(await loadIndoorPlans(core, "demo-library", undefined, fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["../core", "constructor", "demo-block-a/../../core"])("never builds an address from %j", async (id) => {
    const fetcher = vi.fn(answer(null));

    expect(await loadIndoorPlans(core, id, undefined, fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects the plans of another building", async () => {
    await expect(
      loadIndoorPlans(core, "demo-block-a", undefined, answer({ ...indoor[0], buildingId: "other" })),
    ).rejects.toBeInstanceOf(DatasetError);
  });
});
