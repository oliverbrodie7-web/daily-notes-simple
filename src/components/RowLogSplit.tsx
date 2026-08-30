import { LOW_RISK_BLOCKED_TITLE } from "../lib/lowRisk";
import { ChevronDownIcon, PlusIcon } from "./Icons";

// The Log control on a roster row, in two halves.
//
// The left half writes a low risk parent in one tap. The right half opens
// the panel the whole button used to open, unchanged, so nothing that could
// be logged before has become unreachable. The arrow is not a menu: there
// is one panel and it already holds every method.

type RowLogSplitProps = {
  studentName: string;
  // The student's P2 is already complete, so a low risk row would replace
  // what the row says rather than add to it.
  blocked: boolean;
  // This student's write is in flight.
  busy: boolean;
  onLowRisk: () => void;
  onOpenPanel: () => void;
};

export function RowLogSplit({
  studentName,
  blocked,
  busy,
  onLowRisk,
  onOpenPanel,
}: RowLogSplitProps) {
  return (
    <div className="row-log-split">
      <button
        type="button"
        className="row-log-main"
        aria-label={`Log low risk parent for ${studentName}`}
        disabled={blocked || busy}
        title={blocked ? LOW_RISK_BLOCKED_TITLE : undefined}
        onClick={onLowRisk}
      >
        <PlusIcon size={15} />
        Low risk
      </button>
      {/* Never disabled. A student whose P2 is already complete still needs
          a way to log something else. */}
      <button
        type="button"
        className="row-log-arrow"
        aria-label={`More logging options for ${studentName}`}
        onClick={onOpenPanel}
      >
        <ChevronDownIcon size={15} />
      </button>
    </div>
  );
}
