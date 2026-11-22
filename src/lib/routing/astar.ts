/** A* over any graph. The same input always gives the same path. */

export interface SearchEdge {
  to: string;
  cost: number;
}

/**
 * The cheapest chain of edges from start to goal, or null when there is none.
 *
 * `heuristic` must never be more than the real remaining cost. Use `() => 0` when
 * there is no such bound.
 */
export function findPath<E extends SearchEdge>(
  start: string,
  goal: string,
  edgesFrom: (node: string) => Iterable<E>,
  heuristic: (node: string) => number,
): E[] | null {
  const open = new MinHeap();
  const best = new Map<string, number>([[start, 0]]);
  const cameBy = new Map<string, { edge: E; from: string }>();
  const closed = new Set<string>();
  open.push(start, heuristic(start));

  for (let node = open.pop(); node !== null; node = open.pop()) {
    if (node === goal) return trace(goal, start, cameBy);
    if (closed.has(node)) continue;
    closed.add(node);

    const cost = best.get(node) as number;
    for (const edge of edgesFrom(node)) {
      if (closed.has(edge.to) || !Number.isFinite(edge.cost) || edge.cost < 0) continue;
      const next = cost + edge.cost;
      if (next < (best.get(edge.to) ?? Infinity)) {
        best.set(edge.to, next);
        cameBy.set(edge.to, { edge, from: node });
        open.push(edge.to, next + heuristic(edge.to));
      }
    }
  }
  return null;
}

function trace<E>(goal: string, start: string, cameBy: Map<string, { edge: E; from: string }>): E[] {
  const edges: E[] = [];
  for (let node = goal; node !== start; ) {
    const step = cameBy.get(node) as { edge: E; from: string };
    edges.push(step.edge);
    node = step.from;
  }
  return edges.reverse();
}

/** Smallest first; equal ones in the order they came. */
class MinHeap {
  private items: { node: string; priority: number; order: number }[] = [];
  private pushed = 0;

  push(node: string, priority: number): void {
    this.items.push({ node, priority, order: this.pushed++ });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): string | null {
    if (this.items.length === 0) return null;
    const top = this.items[0].node;
    const last = this.items.pop() as (typeof this.items)[number];
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && this.before(left, smallest)) smallest = left;
        if (right < this.items.length && this.before(right, smallest)) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private before(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    return x.priority < y.priority || (x.priority === y.priority && x.order < y.order);
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
  }
}
