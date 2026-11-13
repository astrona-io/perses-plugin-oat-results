import { Theme } from "@mui/material";
import { CheckStatus, PromotionStatus } from "./data";
import { Severity } from "./oat-results-chart-types";
import { CHECK_STATUS_META, PROMOTION_META, severityColour } from "./status";

/** Theme colours resolved once per theme, so rows get plain strings and stay memoisable. */
export type Colours = Record<CheckStatus | PromotionStatus, string> & {
  severity: Record<Severity | "none", string>;
  skippedNote: string;
  history: string;
  border: string;
};

export function resolveColours(theme: Theme): Colours {
  const severity = {
    critical: severityColour(theme, "critical"),
    high: severityColour(theme, "high"),
    medium: severityColour(theme, "medium"),
    low: severityColour(theme, "low"),
    unknown: severityColour(theme, "unknown"),
    none: severityColour(theme, undefined),
  };
  return {
    pass: CHECK_STATUS_META.pass.colour(theme),
    warn: CHECK_STATUS_META.warn.colour(theme),
    fail: CHECK_STATUS_META.fail.colour(theme),
    skipped: CHECK_STATUS_META.skipped.colour(theme),
    unknown: CHECK_STATUS_META.unknown.colour(theme),
    promoted: PROMOTION_META.promoted.colour(theme),
    blocked: PROMOTION_META.blocked.colour(theme),
    pending: PROMOTION_META.pending.colour(theme),
    severity,
    skippedNote: theme.palette.text.secondary,
    history: theme.palette.primary.main,
    border: theme.palette.divider,
  };
}
