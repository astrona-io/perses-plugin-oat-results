import { ReactElement, useMemo } from "react";
import { Box, IconButton, Link, Typography } from "@mui/material";
import { FormatOptions, formatValue } from "@perses-dev/components";
import {
  replaceVariablesInString,
  useAllVariableValues,
} from "@perses-dev/plugin-system";
import Close from "mdi-material-ui/Close";
import OpenInNew from "mdi-material-ui/OpenInNew";
import { checkLabel, imageRef, OatRow } from "./data";
import { resolveLinks } from "./links";
import { LinkTemplates } from "./oat-results-chart-types";
import { CHECK_STATUS_META } from "./status";
import { Colours } from "./colours";

export interface DetailStripProps {
  row: OatRow;
  check: string;
  checkLabels?: Record<string, string>;
  linkTemplates?: LinkTemplates;
  durationFormat: FormatOptions;
  colours: Colours;
  onClose: () => void;
}

/** What one cell stands for: status, message, duration, run, base image and links. */
export function DetailStrip(props: DetailStripProps): ReactElement {
  const {
    row,
    check,
    checkLabels,
    linkTemplates,
    durationFormat,
    colours,
    onClose,
  } = props;
  const variables = useAllVariableValues();
  const result = row.checks[check];
  const name = checkLabel(check, checkLabels);
  const ref = imageRef(row.image, row.tag);

  const links = useMemo(
    () =>
      resolveLinks(linkTemplates, {
        image: row.image,
        tag: row.tag,
        run_id: row.runId,
        check,
        base_image: row.baseImage,
        base_tag: row.baseTag,
        previous_tag: row.previousTag,
        run_url: row.runUrl,
      }).map((link) => ({
        ...link,
        href: replaceVariablesInString(link.href, variables),
      })),
    [linkTemplates, row, check, variables],
  );

  const meta = result ? CHECK_STATUS_META[result.status] : undefined;
  const fields: Array<[string, string | ReactElement | undefined]> = [
    [
      "Status",
      meta && result ? (
        <Box
          component="span"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
          style={{ color: colours[result.status] }}
        >
          <meta.Icon fontSize="inherit" />
          {meta.label}
        </Box>
      ) : (
        "No result"
      ),
    ],
    ["Why skipped", result?.skipReason],
    ["Message", result?.message],
    [
      "Duration",
      result?.durationSeconds !== undefined
        ? formatValue(result.durationSeconds, durationFormat)
        : undefined,
    ],
    ["Run", row.runId || undefined],
    [
      "Base image",
      row.baseImage ? imageRef(row.baseImage, row.baseTag) : undefined,
    ],
    ["Previous tag", row.previousTag],
  ];

  return (
    <Box
      component="section"
      aria-label={`Details: ${ref} ${name}`}
      sx={{
        borderTop: 1,
        borderColor: "divider",
        px: 1,
        py: 0.75,
        flexShrink: 0,
        maxHeight: "45%",
        overflow: "auto",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography
          variant="subtitle2"
          component="h3"
          sx={{ flexGrow: 1, textTransform: "none" }}
        >
          {ref} · {name}
        </Typography>
        <IconButton size="small" aria-label="Close details" onClick={onClose}>
          <Close fontSize="small" />
        </IconButton>
      </Box>
      <Box
        component="dl"
        sx={{
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          columnGap: 2,
          rowGap: 0.25,
          m: 0,
          fontSize: "0.8125rem",
          "& dt": { color: "text.secondary" },
          "& dd": { m: 0, wordBreak: "break-word" },
        }}
      >
        {fields
          .filter(([, value]) => value !== undefined && value !== "")
          .map(([label, value]) => (
            <Box key={label} sx={{ display: "contents" }}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Box>
          ))}
      </Box>
      {links.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 0.5 }}>
          {links.map((link) => (
            <Link
              key={link.kind}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
            >
              {link.label}
              <OpenInNew fontSize="inherit" aria-hidden="true" />
            </Link>
          ))}
        </Box>
      )}
    </Box>
  );
}
