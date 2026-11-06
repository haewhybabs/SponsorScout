import { describe, it, expect } from "vitest";
import { buildPrompt } from "../src/cv/generateApplication.js";

describe("buildPrompt", () => {
  it("includes job details and instructs reading the CV from disk", () => {
    const prompt = buildPrompt(
      { title: "Senior Software Engineer", employerRaw: "Monzo", location: "London", description: "Build things." },
      "reports/applications/abc123",
    );
    expect(prompt).toContain("Senior Software Engineer");
    expect(prompt).toContain("Monzo");
    expect(prompt).toContain("Build things.");
    expect(prompt).toContain("config/cv.md");
    expect(prompt).toContain("reports/applications/abc123/cv.md");
    expect(prompt).toContain("reports/applications/abc123/cover-letter.md");
  });

  it("handles a missing description gracefully", () => {
    const prompt = buildPrompt(
      { title: "Engineer", employerRaw: "X", location: "London", description: undefined },
      "reports/applications/xyz",
    );
    expect(prompt).toContain("no description available");
  });

  it("instructs against fabrication and against using other tools", () => {
    const prompt = buildPrompt(
      { title: "Engineer", employerRaw: "X", location: "London", description: "desc" },
      "out",
    );
    expect(prompt.toLowerCase()).toContain("never invent");
    expect(prompt).toContain("Do not use any other tool");
  });

  it("instructs picking between multiple CV variants when the file has more than one", () => {
    const prompt = buildPrompt(
      { title: "Engineer", employerRaw: "X", location: "London", description: "desc" },
      "out",
    );
    expect(prompt.toLowerCase()).toContain("more than one cv variant");
    expect(prompt.toLowerCase()).toContain("note on which cv variant");
  });
});
