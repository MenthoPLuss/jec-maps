"use client";

import Button from "@/components/ui/Button";
import { formatDistance } from "@/lib/format";
import { isApprovable, type CandidateFile, type CandidateKind, type ReviewItem } from "@/lib/review/candidates";
import { approveCommands, fileNameProblem, reviewerProblem, type PathAccess } from "@/lib/review/commands";

import CommandBox from "./CommandBox";

export interface OpenFile {
  name: string;
  file: CandidateFile;
  items: ReviewItem[];
}

interface FileReviewProps {
  open: OpenFile;
  isApproved: (item: ReviewItem) => boolean;
  chosen: ReadonlySet<string>;
  onChoose: (ids: string[]) => void;
  access: PathAccess | null;
  onAccess: (access: PathAccess) => void;
  /** Paths only. */
  unconnected: ReadonlySet<string>;
  lengthM: number;
  reviewer: string;
  onShow: (item: ReviewItem) => void;
  onPlaceEntrances: () => void;
}

const HOW: Record<CandidateKind, string> = {
  boundary: "Choose the outline of the campus. There is only one.",
  buildings:
    "Choose the buildings that are drawn and named right. Give an unnamed building its name in OpenStreetMap first, then import again.",
  paths:
    "Choose only paths that you walked yourself, where nothing stopped you. Dashed lines are not chosen, solid blue ones are. Red lines with gaps are chosen, but not connected to the rest, so routes would never use them.",
  places: "Choose the places that are right.",
  rooms: "Choose the rooms that are right. Rooms have no position, so the map doesn't show them.",
  entrances: "Choose the entrances that are right.",
  "entrance-suggestions":
    "Positions from your entrance photos. They can be tens of metres off: use them as a guide when you place the entrances.",
};

const ACCESS: { value: PathAccess; label: string }[] = [
  { value: "public", label: "Public: anyone may walk here" },
  { value: "restricted", label: "Restricted: only some people (never used for routes)" },
  { value: "private", label: "Private: closed (never used for routes)" },
];

export default function FileReview(props: FileReviewProps) {
  const { open, isApproved, chosen, onChoose, access, onAccess, unconnected, lengthM, reviewer, onShow } = props;
  const { kind } = open.file;
  const approvable = isApprovable(kind);
  const single = kind === "boundary";
  const choosable = open.items.filter((item) => !item.notApprovable && !isApproved(item));
  const picked = open.items.filter((item) => chosen.has(item.id) && choosable.includes(item));

  const toggle = (item: ReviewItem, on: boolean) => {
    if (single) onChoose(on ? [item.id] : []);
    else onChoose(on ? [...picked.map((entry) => entry.id), item.id] : picked.map((entry) => entry.id).filter((id) => id !== item.id));
  };

  return (
    <section aria-labelledby="file-title" className="space-y-4">
      <div>
        <h2 id="file-title" className="font-bold break-all">
          {open.name}
        </h2>
        <p className="text-ink-muted">{provenance(open.file)}</p>
      </div>
      <p>{HOW[kind]}</p>

      {!approvable && <Button onClick={props.onPlaceEntrances}>Place entrances</Button>}

      {kind === "paths" && (
        <fieldset className="space-y-1">
          <legend className="font-semibold">Who may walk on the chosen paths?</legend>
          {ACCESS.map((option) => (
            <label key={option.value} className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="path-access"
                checked={access === option.value}
                onChange={() => onAccess(option.value)}
                className="size-5"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      )}

      {approvable && (
        <div className="flex flex-wrap items-center gap-2">
          {!single && (
            <>
              <Button look="secondary" onClick={() => onChoose(choosable.map((item) => item.id))} disabled={choosable.length === 0}>
                Choose all
              </Button>
              <Button look="secondary" onClick={() => onChoose([])} disabled={picked.length === 0}>
                Choose none
              </Button>
            </>
          )}
          <p data-testid="choice-summary" role="status">
            {summary(kind, picked.length, lengthM, picked.filter((item) => unconnected.has(item.id)).length)}
          </p>
        </div>
      )}

      <ul className="divide-y divide-line border-y border-line">
        {open.items.map((item, index) => {
          const approved = isApproved(item);
          const inputId = `pick-${index}`;
          return (
            <li key={`${item.id}-${index}`} className="flex items-start gap-3 py-2">
              {approvable && (
                <input
                  id={inputId}
                  type={single ? "radio" : "checkbox"}
                  name={single ? "pick-one" : undefined}
                  checked={approved || chosen.has(item.id)}
                  disabled={approved || item.notApprovable !== null}
                  onChange={(event) => toggle(item, event.target.checked)}
                  className="mt-1 size-5 shrink-0"
                />
              )}
              <label htmlFor={approvable ? inputId : undefined} className="min-w-0 flex-1">
                <span className="font-medium">{item.title}</span>
                <span className="block break-all text-xs text-ink-muted">
                  {item.detail} · {item.id}
                </span>
                {approved && <span className="block text-xs font-semibold text-good">Approved already</span>}
                {!approved && unconnected.has(item.id) && chosen.has(item.id) && (
                  <span className="block text-xs font-semibold text-danger">Not connected to the other paths</span>
                )}
                {item.notApprovable && <span className="block text-xs text-ink-muted">{item.notApprovable}</span>}
              </label>
              <span className="flex shrink-0 flex-col items-end">
                {item.geometry && (
                  <Button look="quiet" onClick={() => onShow(item)} aria-label={`Show ${item.title} (${item.id}) on the map`}>
                    Show
                  </Button>
                )}
                {item.osmId && (
                  <a
                    href={`https://www.openstreetmap.org/${item.osmId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-1 text-xs text-accent underline underline-offset-2"
                  >
                    On OSM
                  </a>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {approvable && picked.length > 0 && (
        <Approve open={open} ids={picked.map((item) => item.id)} reviewer={reviewer} access={access} />
      )}
    </section>
  );
}

function Approve({ open, ids, reviewer, access }: { open: OpenFile; ids: string[]; reviewer: string; access: PathAccess | null }) {
  const needsAccess = open.file.kind === "paths";
  const problem =
    fileNameProblem(open.name) ??
    reviewerProblem(reviewer) ??
    (needsAccess && !access ? "Choose who may walk on the chosen paths." : null);

  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <h3 className="font-bold">Approve what you chose</h3>
      {problem ? (
        <p data-testid="approve-problem" className="font-medium text-warn">
          {problem}
        </p>
      ) : (
        <CommandBox
          commands={approveCommands({ fileName: open.name, ids, reviewer, access: needsAccess ? (access ?? undefined) : undefined })}
        />
      )}
    </div>
  );
}

function summary(kind: CandidateKind, count: number, lengthM: number, unconnected: number): string {
  if (count === 0) return "Nothing chosen yet.";
  if (kind !== "paths") return `${count} chosen.`;
  const left = unconnected > 0 ? ` ${unconnected} of them not connected.` : "";
  return `${count} chosen, ${formatDistance(lengthM)}.${left}`;
}

function provenance({ provenance: facts }: CandidateFile): string {
  const text = (key: string) => (typeof facts[key] === "string" ? (facts[key] as string) : "");
  if (text("osmDataFrom")) return `From OpenStreetMap, as it was on ${text("osmDataFrom").slice(0, 10)}.`;
  if (text("origin")) return `From ${text("origin")}.`;
  return "";
}
