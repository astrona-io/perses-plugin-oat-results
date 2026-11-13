import { interpolate, isSafeHref, resolveLinks } from "./links";

const context = {
  image: "team/app",
  tag: "1.0 rc",
  run_id: "run-7",
  check: "health",
  previous_tag: "0.9",
  run_url: "https://ci.example.com/runs/7?x=1",
};

describe("interpolate", () => {
  it("URL-encodes values, inserts run_url as is and keeps unknown variables", () => {
    expect(
      interpolate(
        "https://x/${image}/${tag}?run=${run_id}&c=${check}&v=${env}&u=${run_url}",
        context,
      ),
    ).toBe(
      "https://x/team%2Fapp/1.0%20rc?run=run-7&c=health&v=${env}&u=https://ci.example.com/runs/7?x=1",
    );
  });

  it("empties a known variable without a value", () => {
    expect(interpolate("a${base_image}b", context)).toBe("ab");
  });
});

describe("isSafeHref", () => {
  it.each([
    ["https://example.com", true],
    ["http://example.com", true],
    ["/relative/path", true],
    ["//example.com/x", true],
    ["javascript:alert(1)", false],
    [" JavaScript:alert(1)", false],
    ["data:text/html,x", false],
    ["", false],
  ])("%p is %p", (href, safe) => {
    expect(isSafeHref(href)).toBe(safe);
  });
});

describe("resolveLinks", () => {
  it("resolves logs, pipeline run and diff in order", () => {
    const links = resolveLinks(
      {
        diff: "https://git/${image}/compare/${previous_tag}...${tag}",
        logs: "https://logs/?q=${run_id}",
        pipelineRun: "https://ci/${run_id}",
      },
      context,
    );
    expect(links.map((l) => [l.kind, l.href])).toEqual([
      ["logs", "https://logs/?q=run-7"],
      ["pipelineRun", "https://ci/run-7"],
      ["diff", "https://git/team%2Fapp/compare/0.9...1.0%20rc"],
    ]);
  });

  it("falls back to run_url and drops the diff without a previous tag", () => {
    const links = resolveLinks(
      { diff: "https://git/${previous_tag}" },
      { ...context, previous_tag: undefined },
    );
    expect(links).toEqual([
      {
        kind: "pipelineRun",
        label: "Pipeline run",
        href: "https://ci.example.com/runs/7?x=1",
      },
    ]);
  });

  it("drops unsafe links", () => {
    expect(
      resolveLinks(
        { logs: "javascript:alert('${image}')" },
        { image: "a", tag: "1", run_id: "r" },
      ),
    ).toEqual([]);
  });
});
