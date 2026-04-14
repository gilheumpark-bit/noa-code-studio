import {
  buildProjectSpecChatSeed,
  toCoreProjectSpec,
  type ProjectSpecFormData,
} from "@/lib/code-studio/core/project-spec-bridge";

describe("project-spec-bridge", () => {
  it("maps ProjectSpecForm data to core ProjectSpec", () => {
    const form: ProjectSpecFormData = {
      category: "web-app",
      title: "Galaxy Dashboard",
      answers: [
        { questionId: "q1", answer: "admin dashboard with analytics" },
        { questionId: "q2", answer: ["Next.js", "TypeScript", "Tailwind CSS"] },
        { questionId: "q3", answer: "Operations team" },
        { questionId: "q4", answer: "Vercel" },
      ],
    };

    const spec = toCoreProjectSpec(form);
    expect(spec.name).toBe("Galaxy Dashboard");
    expect(spec.framework).toBe("web-app");
    expect(spec.techStack).toEqual(["Next.js", "TypeScript", "Tailwind CSS"]);
    expect(spec.description).toContain("admin dashboard with analytics");
    expect(spec.description).toContain("Target users: Operations team");
    expect(spec.description).toContain("Deployment: Vercel");
  });

  it("builds a deterministic chat seed around formatted spec", () => {
    const spec = toCoreProjectSpec({
      category: "api",
      title: "Orbit API",
      answers: [{ questionId: "q2", answer: ["Express", "Zod"] }],
    });
    const seed = buildProjectSpecChatSeed(spec);
    expect(seed).toContain("Use this Project Spec as the single source of truth.");
    expect(seed).toContain("Project: Orbit API");
    expect(seed).toContain("Tech Stack: Express, Zod");
  });
});

