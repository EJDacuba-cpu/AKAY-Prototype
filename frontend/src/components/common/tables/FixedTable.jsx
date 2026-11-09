import {
  TABLE_HEAD_HEIGHT,
  TABLE_PAGE_SIZE,
  TABLE_ROW_HEIGHT,
  fixedTableVars,
} from "../../../utils/tablePaging";
import { setTitleIfTruncated } from "../../../utils/truncationTitle";

/**
 * Scroll wrapper + table with a fixed height (header + `pageSize` rows). Rows are `TABLE_ROW_HEIGHT` tall and
 * long text is cut with an ellipsis (see `.akay-fixed-table` in index.css). Children are <thead>/<tbody>.
 * Empty and error states should fill `var(--akay-empty-h)`.
 * The fixed height sits on the inner box so a horizontal scrollbar, when shown, adds below it instead of
 * clipping the last row. Never put overflow-y on the table itself — that nests a scroller inside the page
 * or clinical-directory results pane and steals the wheel. Pass `lockHeight={false}` when the list length
 * is not paginated to ten rows (profile histories): rows stay 56px and truncate, but the sheet grows so
 * the outer content scroller owns vertical scroll.
 */
export default function FixedTable({
  minWidth = "min-w-[900px]",
  pageSize = TABLE_PAGE_SIZE,
  rowHeight = TABLE_ROW_HEIGHT,
  headHeight = TABLE_HEAD_HEIGHT,
  lockHeight = true,
  children,
}) {
  const height = headHeight + pageSize * rowHeight;
  const vars = {
    ...fixedTableVars(pageSize),
    "--akay-head-h": `${headHeight}px`,
    "--akay-row-h": `${rowHeight}px`,
    "--akay-empty-h": `${pageSize * rowHeight}px`,
  };

  const table = (
    <table
      className={`w-full ${minWidth} border-separate border-spacing-0 text-left`}
      onMouseOver={setTitleIfTruncated}
      onFocusCapture={setTitleIfTruncated}
    >
      {children}
    </table>
  );

  if (!lockHeight) {
    return (
      <div className="akay-fixed-table w-full min-w-0 overflow-x-auto overscroll-x-contain" style={vars}>
        {table}
      </div>
    );
  }

  return (
    <div className="akay-fixed-table w-full min-w-0 overflow-x-auto overscroll-x-contain" style={vars}>
      <div style={{ height }}>{table}</div>
    </div>
  );
}
