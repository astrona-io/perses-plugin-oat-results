import { memo, ReactElement } from "react";
import ChevronDown from "mdi-material-ui/ChevronDown";
import ChevronRight from "mdi-material-ui/ChevronRight";
import SubdirectoryArrowRight from "mdi-material-ui/SubdirectoryArrowRight";
import { checkLabel, imageRef, OatRow } from "./data";
import { Sparkline } from "./Sparkline";
import { CHECK_STATUS_META, PROMOTION_META } from "./status";
import { Colours } from "./colours";

export interface ImageRowProps {
  row: OatRow;
  checks: string[];
  checkLabels?: Record<string, string>;
  colours: Colours;
  /** The selected check of this row, if the selection is in this row. */
  selectedCheck?: string;
  collapsed: boolean;
  showHistory: boolean;
  onToggle: (rowId: string) => void;
  onSelect: (rowId: string, check: string) => void;
}

const INDENT_PX = 18;

/** One image. Memoised: a row re-renders only when its own data, collapse or selection changes. */
export const ImageRow = memo(function ImageRow(
  props: ImageRowProps,
): ReactElement {
  const {
    row,
    checks,
    checkLabels,
    colours,
    selectedCheck,
    collapsed,
    showHistory,
    onToggle,
    onSelect,
  } = props;
  const ref = imageRef(row.image, row.tag);
  const isBase = row.childIds.length > 0;

  return (
    <tr data-row-id={row.id}>
      <th
        scope="row"
        className="oat-name"
        style={{ paddingLeft: 4 + row.depth * INDENT_PX }}
      >
        <div className="oat-name-line">
          {isBase ? (
            <button
              type="button"
              className="oat-toggle"
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? "Expand" : "Collapse"} dependents of ${ref}`}
              onClick={() => onToggle(row.id)}
            >
              {collapsed ? (
                <ChevronRight fontSize="inherit" />
              ) : (
                <ChevronDown fontSize="inherit" />
              )}
            </button>
          ) : (
            <span className="oat-toggle-spacer" aria-hidden="true">
              {row.depth > 0 && <SubdirectoryArrowRight fontSize="inherit" />}
            </span>
          )}
          <span
            className={isBase ? "oat-image oat-base" : "oat-image"}
            title={ref}
          >
            {row.image}
          </span>
          {row.tag && <span className="oat-tag">:{row.tag}</span>}
          {isBase && collapsed && (
            <span className="oat-muted"> (+{row.childIds.length} hidden)</span>
          )}
        </div>
        {row.hasSkipped && row.blockedBy && (
          <div className="oat-note" style={{ color: colours.skippedNote }}>
            Skipped: base{" "}
            <strong>{imageRef(row.blockedBy.image, row.blockedBy.tag)}</strong>{" "}
            is blocked ({row.blockedBy.reason})
          </div>
        )}
        {row.blocked && row.blockedDependents > 0 && (
          <div className="oat-note" style={{ color: colours.fail }}>
            Blocked ({row.blockReason}): holds back {row.blockedDependents}{" "}
            dependent{row.blockedDependents === 1 ? "" : "s"}
          </div>
        )}
      </th>
      {checks.map((check) => {
        const result = row.checks[check];
        const name = checkLabel(check, checkLabels);
        if (!result) {
          return (
            <td key={check} className="oat-cell">
              <span
                className="oat-none"
                role="img"
                aria-label={`${ref} ${name}: no result`}
                title="No result"
              >
                –
              </span>
            </td>
          );
        }
        const meta = CHECK_STATUS_META[result.status];
        const selected = selectedCheck === check;
        const description = result.skipReason
          ? `${meta.label}: ${result.skipReason}`
          : meta.label;
        return (
          <td key={check} className="oat-cell">
            <button
              type="button"
              className={selected ? "oat-status oat-selected" : "oat-status"}
              aria-pressed={selected}
              aria-label={`${ref} ${name}: ${description}`}
              title={`${name}: ${description}`}
              onClick={() => onSelect(row.id, check)}
              style={{ color: colours[result.status] }}
            >
              <meta.Icon fontSize="inherit" />
            </button>
          </td>
        );
      })}
      <td className="oat-cve">
        {row.cve ? (
          <span
            title={`${row.cve.before} before the rebuild, ${row.cve.after} after${row.cve.worstAfter ? ` (worst: ${row.cve.worstAfter})` : ""}`}
          >
            {row.cve.before}
            <span className="oat-muted" aria-label="then">
              {" → "}
            </span>
            <span
              style={{
                color: colours.severity[row.cve.worstAfter ?? "none"],
                fontWeight: 600,
              }}
            >
              {row.cve.after}
            </span>
            {row.cve.worstAfter && (
              <span className="oat-sev">
                {" "}
                {row.cve.worstAfter.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
        ) : (
          <span className="oat-muted" title="No CVE data">
            –
          </span>
        )}
      </td>
      <td className="oat-gate">
        {row.promotion ? (
          <GateChip status={row.promotion} colours={colours} />
        ) : (
          <span className="oat-muted" title="No promotion status">
            –
          </span>
        )}
      </td>
      {showHistory && (
        <td className="oat-history">
          <Sparkline
            values={row.history}
            colour={colours.history}
            emptyColour={colours.border}
          />
        </td>
      )}
    </tr>
  );
});

function GateChip({
  status,
  colours,
}: {
  status: keyof typeof PROMOTION_META;
  colours: Colours;
}): ReactElement {
  const meta = PROMOTION_META[status];
  const colour = colours[status];
  return (
    <span className="oat-chip" style={{ color: colour, borderColor: colour }}>
      <meta.Icon fontSize="inherit" />
      {meta.label}
    </span>
  );
}
