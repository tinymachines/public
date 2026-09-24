import { describe, expect, test } from "bun:test";
import { clusters, currentIn, sectionAt } from "./strip";
import { sections } from "./nav";
import type { Section } from "./nav";

const nes: Section = {
  title: "The NES console",
  when: "/nes",
  items: [
    { href: "/nes", label: "Overview", group: "use" },
    { href: "/nes/play", label: "Play", group: "use" },
    { href: "/nes/signal", label: "The signal", group: "parts" },
    { href: "/docs/nes", label: "Notebook", group: "read" },
  ],
};
const six: Section = { title: "6502", when: "/6502", items: [{ href: "/6502", label: "Overview" }] };

describe("where a path stands", () => {
  test("a page inside a section finds it, in either language; a site page finds none", () => {
    expect(sectionAt([six, nes], "/nes/signal/bench")?.when).toBe("/nes");
    expect(sectionAt([six, nes], "/ja/nes")?.when).toBe("/nes");
    expect(sectionAt([six, nes], "/nesx")).toBeUndefined();
    expect(sectionAt([six, nes], "/docs")).toBeUndefined();
  });
  test("the part itself is the page, a part above is the location, the landing is never a location", () => {
    expect(currentIn(nes, "/nes/signal", "/nes/signal")).toBe("page");
    expect(currentIn(nes, "/ja/nes/signal/bench", "/ja/nes/signal")).toBe("location");
    expect(currentIn(nes, "/nes/signal/bench", "/nes")).toBeUndefined();
    expect(currentIn(nes, "/nes", "/nes")).toBe("page");
  });
});

describe("clusters", () => {
  test("a new cluster wherever the group changes, and one run where there are no groups", () => {
    expect(clusters(nes.items).map((c) => c.map((i) => i.label))).toEqual([["Overview", "Play"], ["The signal"], ["Notebook"]]);
    expect(clusters(six.items)).toHaveLength(1);
    expect(clusters([])).toEqual([]);
  });
});

describe("the NES section, as the manifest builds it", () => {
  const s = sections().find((x) => x.when === "/nes")!;
  test("Create is on it, beside Play, and the phrases are one word", () => {
    const labels = s.items.map((i) => i.label);
    expect(labels.slice(0, 4)).toEqual(["Overview", "Play", "Create", "Learn"]);
    expect(labels).toContain("Notebook");
    expect(labels).toContain("Retro");
  });
  test("a one-word label keeps the full name for the menu, and only then", () => {
    const learn = s.items.find((i) => i.label === "Learn")!;
    expect(learn.name).toBe("The NES at human speed");
    expect(s.items.find((i) => i.label === "Play")!.name).toBeUndefined();
  });
  test("three clusters: using it, its parts, reading about it", () => {
    expect(clusters(s.items).map((c) => c[0].label)).toEqual(["Overview", "The chips", "Notebook"]);
  });
});
