import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSkill, SKILL_NAME_RE } from "./routes-skills.js";

let home: string; // fake ~/.claude
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "wrud-skills-"));
  mkdirSync(join(home, "skills", "copywriting"), { recursive: true });
  writeFileSync(
    join(home, "skills", "copywriting", "SKILL.md"),
    "# Copywriting",
  );
  mkdirSync(join(home, "commands"), { recursive: true });
  writeFileSync(join(home, "commands", "review.md"), "Review the PR");
  // plugin cache: cache/<marketplace>/<plugin>/<version>/skills/<name>/SKILL.md
  const plug = join(home, "plugins", "cache", "sp", "superpowers", "1.2.0");
  mkdirSync(join(plug, "skills", "brainstorming"), { recursive: true });
  writeFileSync(join(plug, "skills", "brainstorming", "SKILL.md"), "# Brain");
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

describe("resolveSkill", () => {
  it("finds a user skill by name", () => {
    const r = resolveSkill("copywriting", [home]);
    expect(r?.kind).toBe("skill");
    expect(r?.content).toBe("# Copywriting");
  });

  it("finds a slash command (leading slash, any case)", () => {
    const r = resolveSkill("/Review", [home]);
    expect(r?.kind).toBe("command");
    expect(r?.content).toBe("Review the PR");
  });

  it("finds a plugin skill via plugin:name", () => {
    const r = resolveSkill("superpowers:brainstorming", [home]);
    expect(r?.content).toBe("# Brain");
    expect(r?.name).toBe("superpowers:brainstorming");
  });

  it("returns null for unknown names", () => {
    expect(resolveSkill("nope", [home])).toBeNull();
  });

  it("rejects path traversal and separators", () => {
    for (const bad of ["../etc", "..%2Fetc", "a/b", "a\\b", ".hidden", ""]) {
      expect(resolveSkill(bad, [home])).toBeNull();
    }
  });
});

describe("SKILL_NAME_RE", () => {
  it("allows the captured name shapes only", () => {
    expect(SKILL_NAME_RE.test("go-to-market")).toBe(true);
    expect(SKILL_NAME_RE.test("elirans-brain:wiki_query")).toBe(true);
    expect(SKILL_NAME_RE.test("../../etc/passwd")).toBe(false);
    expect(SKILL_NAME_RE.test("a b")).toBe(false);
    expect(SKILL_NAME_RE.test("-p")).toBe(false); // can't start with a flag char
  });
});
