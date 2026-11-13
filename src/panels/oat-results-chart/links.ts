import { LinkTemplates } from "./oat-results-chart-types";

/** Values a link template can use, as `${name}`. */
export interface LinkContext {
  image: string;
  tag: string;
  run_id: string;
  check?: string;
  base_image?: string;
  base_tag?: string;
  previous_tag?: string;
  run_url?: string;
}

export interface ResolvedLink {
  kind: keyof LinkTemplates;
  label: string;
  href: string;
}

const LINK_LABELS: Record<keyof LinkTemplates, string> = {
  logs: "Logs",
  pipelineRun: "Pipeline run",
  diff: "Diff vs previous tag",
};

const KNOWN_VARIABLES: Record<keyof LinkContext, true> = {
  image: true,
  tag: true,
  run_id: true,
  check: true,
  base_image: true,
  base_tag: true,
  previous_tag: true,
  run_url: true,
};

/** Variables that hold a whole URL and are inserted as they are. */
const RAW_VARIABLES = new Set<string>(["run_url"]);

/**
 * Replaces `${name}` with the value from `context`, URL-encoded (except `${run_url}`). Unknown
 * names are left as they are, so dashboard variables still reach Perses; a known name without a
 * value becomes empty.
 */
export function interpolate(template: string, context: LinkContext): string {
  return template.replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, name) => {
    if (!(name in KNOWN_VARIABLES)) return match;
    const value = context[name as keyof LinkContext];
    if (value === undefined) return "";
    return RAW_VARIABLES.has(name) ? value : encodeURIComponent(value);
  });
}

/** Only http(s) and relative URLs; a `javascript:` or `data:` link is dropped. */
export function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (!scheme) return true; // relative or protocol-relative
  const name = scheme[1]!.toLowerCase();
  return name === "http" || name === "https";
}

/**
 * The links for the detail strip, in a fixed order: logs, pipeline run, diff. The pipeline run
 * falls back to the `run_url` label; the diff needs a previous tag.
 */
export function resolveLinks(
  templates: LinkTemplates | undefined,
  context: LinkContext,
): ResolvedLink[] {
  const links: ResolvedLink[] = [];
  const add = (kind: keyof LinkTemplates, href: string | undefined): void => {
    if (href && isSafeHref(href))
      links.push({ kind, label: LINK_LABELS[kind], href });
  };
  if (templates?.logs) add("logs", interpolate(templates.logs, context));
  if (templates?.pipelineRun) {
    add("pipelineRun", interpolate(templates.pipelineRun, context));
  } else {
    add("pipelineRun", context.run_url);
  }
  if (templates?.diff && context.previous_tag) {
    add("diff", interpolate(templates.diff, context));
  }
  return links;
}
