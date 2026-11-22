/** Helpers for tests: the demo dataset as editable JSON. Never imported by the app. */
import { demoDatasetFiles } from "../../../scripts/lib/demoCampus";
import { checkDataset } from "./checks";
import { parseDataset, type Dataset, type Issue, type RawFiles } from "./parse";
import { publishDataset } from "./publish";
import type { IndoorPlans, PublishedDataset } from "./published";

/** Loosely typed on purpose: tests break these records in every possible way. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export function demoFiles(): Record<string, Json> {
  return Object.fromEntries(Object.entries(demoDatasetFiles()).map(([name, text]) => [name, JSON.parse(text)]));
}

/** The properties of one record of a file. */
export function record(files: Record<string, Json>, file: string, id: string): Json {
  const list = Array.isArray(files[file]) ? files[file] : files[file].features;
  const found = list.find((entry: Json) => (entry.properties ?? entry).id === id);
  if (!found) throw new Error(`${file} has no ${id}`);
  return found.properties ?? found;
}

/** Turns the demo into a reviewed, live dataset. */
export function reviewedFiles(): Record<string, Json> {
  const files = demoFiles();
  files["dataset-manifest.json"].mode = "live";
  files["dataset-manifest.json"].reviewStatus = "reviewed";
  for (const file of Object.values(files)) {
    const list = Array.isArray(file) ? file : (file.features ?? []);
    for (const entry of list) {
      Object.assign(entry.properties ?? entry, {
        placeholder: false,
        reviewStatus: "reviewed",
        source: "test survey",
      });
    }
  }
  return files;
}

export function mustParse(files: RawFiles): Dataset {
  const { dataset, issues } = parseDataset(files);
  if (!dataset) throw new Error(`The test dataset is broken: ${JSON.stringify(issues, null, 2)}`);
  return dataset;
}

export function problems(files: RawFiles): Issue[] {
  const { dataset, issues } = parseDataset(files);
  return dataset ? [...issues, ...checkDataset(dataset)] : issues;
}

export function published(files: RawFiles = demoFiles()): { core: PublishedDataset; indoor: IndoorPlans[] } {
  return publishDataset(mustParse(files));
}
