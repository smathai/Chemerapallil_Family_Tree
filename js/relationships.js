/**
 * Relationship calculator using BFS on the family tree graph.
 * Works entirely client-side from data.json.
 */

class FamilyTree {
  constructor(people) {
    this.byId = {};
    for (const p of people) {
      this.byId[p.id] = p;
    }
  }

  // BFS to find shortest path between two people using parent/child/spouse edges.
  // Returns array of {id, rel} steps, or null if no path found.
  findPath(fromId, toId) {
    if (fromId === toId) return [];

    const visited = new Set([fromId]);
    const queue = [[fromId, []]]; // [currentId, path so far]

    while (queue.length > 0) {
      const [cur, path] = queue.shift();
      const person = this.byId[cur];
      if (!person) continue;

      const neighbors = [];

      // Parents
      for (const p of person.parents || []) {
        neighbors.push({ id: p.id, rel: "parent" });
      }
      // Children
      for (const c of person.children || []) {
        neighbors.push({ id: c.id, rel: "child" });
      }
      // Spouses
      for (const s of person.spouses || []) {
        neighbors.push({ id: s.id, rel: "spouse" });
      }

      for (const { id, rel } of neighbors) {
        if (!id || visited.has(id)) continue;
        const newPath = [...path, { id, rel, from: cur }];
        if (id === toId) return newPath;
        visited.add(id);
        queue.push([id, newPath]);
      }
    }

    return null; // no connection found
  }

  // Describe the relationship from person A to person B in plain English.
  describeRelationship(fromId, toId) {
    if (fromId === toId) return "same person";

    const path = this.findPath(fromId, toId);
    if (!path) return "Not connected in this family tree";

    // Count ups (to parent) and downs (to child), ignoring spouse steps
    const steps = path.map(s => s.rel);

    // Handle direct spouse
    if (steps.length === 1 && steps[0] === "spouse") {
      return "Spouse";
    }

    // Any "spouse" hop (leading, trailing, or in the middle) means the path
    // crosses a marriage somewhere -- FROM and/or TO reach their common
    // connection only by marriage there, not blood. Each such crossing is
    // described using the term the OTHER blood side actually uses for the
    // spouse's own relative, suffixed with "'s spouse" -- e.g. "my uncle's
    // wife" is built from "the term I use for my uncle" (not "the term my
    // uncle uses for me", which is the asymmetric-opposite word for
    // relations like aunt/uncle vs niece/nephew). Getting this argument
    // order backwards is exactly the bug this replaced: it produced
    // "Niece/Nephew's spouse" for someone's own aunt-by-marriage.
    const spouseIdxs = [];
    steps.forEach((s, i) => { if (s === "spouse") spouseIdxs.push(i); });

    if (spouseIdxs.length > 0) {
      const first = spouseIdxs[0], last = spouseIdxs[spouseIdxs.length - 1];

      if (first === last) {
        if (first === 0) {
          // FROM is married-in; TO is reached via a pure blood chain from
          // FROM's spouse. Borrow that spouse's own term for TO as-is.
          const anchor = path[0].id;
          const bloodLabel = this.describeRelationship(anchor, toId);
          return `${bloodLabel}'s spouse`;
        }
        if (first === steps.length - 1) {
          // TO is married-in; FROM reaches TO's spouse via a pure blood
          // chain. Use FROM's own term for that spouse (the anchor), not
          // the anchor's term for FROM -- they're asymmetric in general.
          const anchor = path[first - 1].id;
          const bloodLabel = this.describeRelationship(anchor, fromId);
          return `${bloodLabel}'s spouse`;
        }
        // Interior: FROM and TO each have their own real blood connection,
        // bridged by one couple's marriage in between (e.g. FROM's uncle
        // married TO's aunt). Compose both halves around the bridge.
        const leftAnchor = path[first - 1].id;
        const rightAnchor = path[first].id;
        const rightLabel = this.describeRelationship(rightAnchor, toId);
        const leftLabel = this.describeRelationship(fromId, leftAnchor);
        return `${rightLabel}'s spouse's ${leftLabel}`;
      }

      if (spouseIdxs.length === 2 && first === 0 && last === steps.length - 1) {
        // Both FROM and TO are married-in, with one blood relationship
        // bridging their two respective spouses.
        const leftAnchor = path[0].id;
        const rightAnchor = path[last - 1].id;
        const bloodLabel = this.describeRelationship(rightAnchor, leftAnchor);
        return `${bloodLabel}'s spouse`;
      }

      // More exotic chains (multiple marriage bridges) -- not worth
      // guessing at a compound phrase nobody would recognize anyway.
      return describeInLaw(steps);
    }

    // Handle direct parent/child. steps[0] === "parent" means TO is FROM's
    // parent -- i.e. FROM is the child -- so the label describing FROM
    // (per the "FROM is the ___ of TO" phrasing) is "Child", not "Parent".
    if (steps.length === 1 && steps[0] === "parent") return "Child";
    if (steps.length === 1 && steps[0] === "child") return "Parent";

    // Handle grandparent/grandchild chains (same FROM-relative-to-TO logic)
    if (steps.every(s => s === "parent")) {
      const n = steps.length;
      if (n === 2) return "Grandchild";
      return `${ordinal(n - 1)} great-grandchild`;
    }
    if (steps.every(s => s === "child")) {
      const n = steps.length;
      if (n === 2) return "Grandparent";
      return `${ordinal(n - 1)} great-grandparent`;
    }

    // Handle sibling: up 1, down 1
    if (steps.length === 2 && steps[0] === "parent" && steps[1] === "child") {
      return "Sibling";
    }

    // Handle aunt/uncle and niece/nephew. First branch: FROM's parent is
    // TO's ancestor via "child" steps only -- TO is FROM's sibling's
    // descendant, so FROM is the elder one here: FROM is TO's Aunt/Uncle.
    if (steps[0] === "parent" && steps.slice(1).every(s => s === "child")) {
      const downs = steps.length - 1;
      if (downs === 1) return "Sibling";
      if (downs === 2) return "Aunt/Uncle";
      return `${ordinal(downs - 2)} great-aunt/uncle`;
    }
    // Second branch: FROM climbs only "parent" steps to reach TO's child --
    // FROM is descended from TO's sibling, so FROM is TO's Niece/Nephew.
    if (steps[steps.length - 1] === "child" && steps.slice(0, -1).every(s => s === "parent")) {
      const ups = steps.length - 1;
      if (ups === 1) return "Sibling";
      if (ups === 2) return "Niece/Nephew";
      return `${ordinal(ups - 2)} great-niece/nephew`;
    }

    // General cousin calculation. Any "spouse" step already returned above,
    // so every remaining step here is pure parent/child.
    // Find the common ancestor turn: sequence of "parent" then sequence of "child"
    let upCount = 0;
    let downCount = 0;
    let pivot = -1;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i] === "parent") upCount++;
      else if (steps[i] === "child") {
        pivot = i;
        break;
      }
    }
    if (pivot !== -1) {
      downCount = steps.slice(pivot).filter(s => s === "child").length;
    }

    if (upCount > 0 && downCount > 0) {
      const degree = Math.min(upCount, downCount);
      const removed = Math.abs(upCount - downCount);
      if (degree === 1 && removed === 0) return "Sibling";
      if (degree === 1 && removed === 1) return upCount > downCount ? "Niece/Nephew" : "Aunt/Uncle";
      const removedStr = removed > 0 ? `, ${removed}x removed` : "";
      return `${ordinal(degree - 1)} cousin${removedStr}`;
    }

    // Fallback: describe the path steps
    return describePathSteps(steps, path.map(s => s.id), this.byId);
  }

  // Return the full chain of names for the path
  pathNames(fromId, toId) {
    const path = this.findPath(fromId, toId);
    if (!path) return null;
    const ids = [fromId, ...path.map(s => s.id)];
    return ids.map(id => this.byId[id]?.display_name || id);
  }
}

function ordinal(n) {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

function describeInLaw(steps) {
  return "In-law (via marriage)";
}

function describePathSteps(steps, ids, byId) {
  return steps.join(" → ");
}

// Export for use in the app
window.FamilyTree = FamilyTree;
