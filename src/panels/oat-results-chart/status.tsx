import { ComponentType } from "react";
import { SvgIconProps, Theme } from "@mui/material";
import AlertCircle from "mdi-material-ui/AlertCircle";
import Cancel from "mdi-material-ui/Cancel";
import CheckCircle from "mdi-material-ui/CheckCircle";
import CheckDecagram from "mdi-material-ui/CheckDecagram";
import ClockOutline from "mdi-material-ui/ClockOutline";
import CloseCircle from "mdi-material-ui/CloseCircle";
import HelpCircleOutline from "mdi-material-ui/HelpCircleOutline";
import MinusCircleOutline from "mdi-material-ui/MinusCircleOutline";
import { CheckStatus, PromotionStatus } from "./data";
import { Severity } from "./oat-results-chart-types";

export interface StatusMeta {
  label: string;
  Icon: ComponentType<SvgIconProps>;
  colour: (theme: Theme) => string;
}

/** Every status has its own icon and label, so colour is never the only cue. */
export const CHECK_STATUS_META: Record<CheckStatus, StatusMeta> = {
  pass: {
    label: "Pass",
    Icon: CheckCircle,
    colour: (t) => t.palette.success.main,
  },
  warn: {
    label: "Warn",
    Icon: AlertCircle,
    colour: (t) => t.palette.warning.main,
  },
  fail: {
    label: "Fail",
    Icon: CloseCircle,
    colour: (t) => t.palette.error.main,
  },
  skipped: {
    label: "Skipped",
    Icon: MinusCircleOutline,
    colour: (t) => t.palette.text.disabled,
  },
  unknown: {
    label: "Unknown value",
    Icon: HelpCircleOutline,
    colour: (t) => t.palette.text.secondary,
  },
};

export const CHECK_STATUS_ORDER: CheckStatus[] = [
  "pass",
  "warn",
  "fail",
  "skipped",
];

export const PROMOTION_META: Record<PromotionStatus, StatusMeta> = {
  promoted: {
    label: "Promoted",
    Icon: CheckDecagram,
    colour: (t) => t.palette.success.main,
  },
  blocked: {
    label: "Blocked",
    Icon: Cancel,
    colour: (t) => t.palette.error.main,
  },
  pending: {
    label: "Pending",
    Icon: ClockOutline,
    colour: (t) => t.palette.warning.main,
  },
};

/** Colour of the CVE count left after the rebuild, by its worst severity. */
export function severityColour(
  theme: Theme,
  severity: Severity | undefined,
): string {
  switch (severity) {
    case "critical":
      return theme.palette.error.main;
    case "high":
      return theme.palette.warning.main;
    case "medium":
      return theme.palette.info.main;
    case "low":
    case "unknown":
      return theme.palette.text.secondary;
    default:
      return theme.palette.success.main;
  }
}
