import { TABLE_HEAD_HEIGHT, TABLE_PAGE_SIZE, TABLE_ROW_HEIGHT, tableBodyHeight, tableEmptyHeight } from "../../../utils/tablePaging";
import { setTitleIfTruncated } from "../../../utils/truncationTitle";

/**
 * Scroll wrapper + table with a fixed height (header + `pageSize` rows). Rows are `TABLE_ROW_HEIGHT` tall and
 * long text is cut with an ellipsis (see `.akay-fixed-table` in index.css). Children are <thead>/<tbody>.
 * Empty and error states should fill `var(--akay-empty-h)`.
 * The fixed height sits on the inner box so a horizontal scrollbar, when shown, adds below it instead of
 * clipping the last row.
 */
export default function FixedTable({ minWidth = "min-w-[900px]", pageSize = TABLE_PAGE_SIZE, children }) {
  return (
    <div
      className="akay-fixed-table w-full min-w-0 overflow-x-auto overscroll-x-contain"
      style={{
        "--akay-head-h": `${TABLE_HEAD_HEIGHT}px`,
        "--akay-row-h": `${TABLE_ROW_HEIGHT}px`,
        "--akay-empty-h": `${tableEmptyHeight(pageSize)}px`,
      }}
    >
      <div style={{ height: tableBodyHeight(pageSize) }}>
        <table
          className={`w-full ${minWidth} border-separate border-spacing-0 text-left`}
          onMouseOver={setTitleIfTruncated}
        >
          {children}
        </table>
      </div>
    </div>
  );
}
