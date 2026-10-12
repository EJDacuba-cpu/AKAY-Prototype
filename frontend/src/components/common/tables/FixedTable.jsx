import { TABLE_PAGE_SIZE, TABLE_ROW_HEIGHT, tableBodyHeight, tableEmptyHeight } from "../../../utils/tablePaging";
import { setTitleIfTruncated } from "../../../utils/truncationTitle";

/**
 * Scroll wrapper + table with a fixed height (header + `pageSize` rows). Rows are `TABLE_ROW_HEIGHT` tall and
 * long text is cut with an ellipsis (see `.akay-fixed-table` in index.css). Children are <thead>/<tbody>.
 * Empty and error states should fill `var(--akay-empty-h)`.
 */
export default function FixedTable({ minWidth = "min-w-[900px]", pageSize = TABLE_PAGE_SIZE, children }) {
  return (
    <div
      className="akay-fixed-table w-full min-w-0 overflow-x-auto overscroll-x-contain"
      style={{
        height: tableBodyHeight(pageSize),
        "--akay-row-h": `${TABLE_ROW_HEIGHT}px`,
        "--akay-empty-h": `${tableEmptyHeight(pageSize)}px`,
      }}
    >
      <table
        className={`w-full ${minWidth} border-separate border-spacing-0 text-left`}
        onMouseOver={setTitleIfTruncated}
      >
        {children}
      </table>
    </div>
  );
}
