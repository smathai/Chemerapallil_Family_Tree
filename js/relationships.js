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

    // Handle direct parent/child
    if (steps.length === 1 && steps[0] === "parent") return "Parent";
    if (steps.length === 1 && steps[0] === "child") return "Child";

    // Handle grandparent/grandchild chains
    if (steps.every(s => s === "parent")) {
      const n = steps.length;
      if (n === 2) return "Grandparent";
      return `${ordinal(n - 1)} great-grandparent`;
    }
    if (steps.every(s => s === "child")) {
      const n = steps.length;
      if (n === 2) return "Grandchild";
      return `${ordinal(n - 1)} great-grandchild`;
    }

    // Handle sibling: up 1, down 1
    if (steps.length === 2 && steps[0] === "parent" && steps[1] === "child") {
      return "Sibling";
    }

    // Handle aunt/uncle and niece/nephew
    if (steps[0] === "parent" && steps.slice(1).every(s => s === "child")) {
      const downs = steps.length - 1;
      if (downs === 1) return "Sibling";
      if (downs === 2) return "Niece/Nephew";
      return `${ordinal(downs - 2)} great-niece/nephew`;
    }
    if (steps[steps.length - 1] === "child" && steps.slice(0, -1).every(s => s === "parent")) {
      const ups = steps.length - 1;
      if (ups === 1) return "Sibling";
      if (ups === 2) return "Aunt/Uncle";
      return `${ordinal(ups - 2)} great-aunt/uncle`;
    }

    // General cousin calculation
    // Find the common ancestor turn: sequence of "parent" then sequence of "child"
    let upCount = 0;
    let downCount = 0;
    let pivot = -1;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i] === "parent") upCount++;
      else if (steps[i] === "child") {
        pivot = i;
        break;
      } else if (steps[i] === "spouse") {
        // spouse in middle = in-law relationship
        return describeInLaw(steps);
      }
    }
    if (pivot !== -1) {
      downCount = steps.slice(pivot).filter(s => s === "child").length;
    }

    if (upCount > 0 && downCount > 0) {
      const degree = Math.min(upCount, downCount);
      const removed = Math.abs(upCount - downCount);
      if (degree === 1 && removed === 0) return "Sibling";
      if (degree === 1 && removed === 1) return upCount > downCount ? "Aunt/Uncle" : "Niece/Nephew";
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
