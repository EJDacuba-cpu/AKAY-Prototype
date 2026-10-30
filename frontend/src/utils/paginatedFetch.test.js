import { test } from "node:test";
import assert from "node:assert/strict";

import { nextReportPage, REPORT_MAX_PAGES, REPORT_PAGE_SIZE } from "./paginatedFetch.js";

test("nextReportPage follows last_page so a large first page cannot hide the rest", () => {
  const response = { data: { last_page: 3, per_page: 100 } };
  assert.equal(nextReportPage(response, 1, 100), 2);
  assert.equal(nextReportPage(response, 3, 12), null);
});

test("nextReportPage keeps walking a full page when last_page is missing", () => {
  assert.equal(nextReportPage({}, 1, REPORT_PAGE_SIZE), 2);
  assert.equal(nextReportPage({}, 1, REPORT_PAGE_SIZE - 1), null);
});

test("nextReportPage stops at the report page cap", () => {
  const response = { data: { last_page: 999 } };
  assert.equal(nextReportPage(response, REPORT_MAX_PAGES, 100), null);
});
