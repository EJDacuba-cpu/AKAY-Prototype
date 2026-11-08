// Run against Vite with the existing Playwright runtime; no package install.
// AKAY_PLAYWRIGHT_MODULE and AKAY_BROWSER_EXECUTABLE select installed tooling.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require(process.env.AKAY_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.AKAY_PRINT_TEST_URL || "http://127.0.0.1:5175";
const output = process.env.AKAY_PRINT_OUTPUT || path.join(os.tmpdir(), "akay-print-verification");
fs.mkdirSync(output, { recursive: true });

async function instrument(page, mode = "complete") {
  await page.addInitScript(({ mode }) => {
    window.printCaptures = [];
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      get() {
        const win = descriptor.get.call(this);
        if (win && this.title === "Prepared print document") {
          win.print = () => {
            if (mode === "blocked") return;
            win.dispatchEvent(new win.Event("beforeprint"));
            const doc = win.document;
            const root = doc.querySelector("[data-akay-print-document]");
            const summaryTable = root.querySelector(".akay-summary-print-table");
            window.printCaptures.push({
              html: doc.documentElement.outerHTML,
              text: doc.body.innerText,
              title: doc.title,
              fontStatus: doc.fonts.status,
              imagesReady: Array.from(doc.images).every(img => img.complete && img.naturalWidth > 0),
              controls: doc.querySelectorAll("button, [role=tooltip], .no-print").length,
              countColumn: summaryTable ? {
                widthRatio: summaryTable.querySelector("th:nth-child(2)").getBoundingClientRect().width / summaryTable.getBoundingClientRect().width,
                alignments: Array.from(summaryTable.querySelectorAll("th:nth-child(2), td:nth-child(2)"), cell => win.getComputedStyle(cell).textAlign),
              } : null,
              overflow: Array.from(root.querySelectorAll("p, td, th, table, section, div")).filter(el =>
                el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent.slice(0, 70) })),
            });
            if (mode === "complete") win.dispatchEvent(new win.Event("afterprint"));
          };
        }
        return win;
      },
    });
  }, { mode });
}

async function fixture(browser, route, params = "", mode = "complete", enforceCsp = false) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
  await instrument(page, mode);
  page.errors = [];
  page.on("pageerror", error => page.errors.push(error.message));
  const origin = enforceCsp ? process.env.AKAY_PRINT_CSP_URL || "http://127.0.0.1:5176" : base;
  await page.goto(`${origin}/tests/fixtures/print-preview.html?route=${encodeURIComponent(route)}${params}`);
  return page;
}

async function capture(page, action = "Print") {
  const before = await page.evaluate(() => window.printCaptures.length);
  await page.getByRole("button", { name: action, exact: true }).click();
  await page.waitForFunction(count => window.printCaptures.length > count, before, { timeout: 12000 });
  const result = await page.evaluate(() => window.printCaptures.at(-1));
  assert.ok(result.text.trim().length > 40, "nonblank document");
  assert.equal(result.fontStatus, "loaded");
  assert.equal(result.imagesReady, true);
  assert.equal(result.controls, 0);
  if (result.countColumn) {
    assert.ok(Math.abs(result.countColumn.widthRatio - 0.12) < 0.01, "Count has a narrow dedicated column");
    assert.ok(result.countColumn.alignments.every(alignment => alignment === "center"), "Count heading and values share the same alignment");
  }
  assert.deepEqual(result.overflow, [], "no horizontally clipped print content");
  assert.deepEqual(page.errors, []);
  return result;
}

async function pdf(browser, name, captured) {
  const page = await browser.newPage();
  await page.goto(`${base}/tests/fixtures/print-preview.html?route=${encodeURIComponent("/bhc/reports")}`);
  // Render exactly the prepared print document using the browser's PDF engine.
  await page.setContent(captured.html, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, img => img.decode()));
  });
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: path.join(output, `${name}.pdf`), preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(path.join(output, `${name}.html`), captured.html);
  await page.close();
}

const results = [];
async function check(name, run) {
  if (process.env.AKAY_PRINT_ONLY && !new RegExp(process.env.AKAY_PRINT_ONLY).test(name)) return;
  try { await run(); results.push({ name, status: "passed" }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: "failed", error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.AKAY_BROWSER_EXECUTABLE });
  try {
    for (const role of ["bhc", "rhu", "admin"]) {
      await check(`${role} reports Print and Export PDF`, async () => {
        const page = await fixture(browser, `/${role}/reports`);
        const printed = await capture(page);
        const exported = await capture(page, "Export PDF");
        assert.equal(exported.text, printed.text);
        assert.match(printed.text, role === "admin" ? /Account & Role Analytics/ : new RegExp(`AKAY ${role.toUpperCase()} Reports`));
        assert.doesNotMatch(printed.text, /Dashboard|Export PDF|Updating reports/);
        await pdf(browser, `${role}-report`, printed);
        await page.close();
      });
    }
    for (const role of ["bhc", "rhu"]) {
      for (const auto of [false, true]) {
        await check(`${role} health record ${auto ? "auto-print route" : "Print button"}`, async () => {
          const page = await fixture(browser, `/${role}/health-records/9002${auto ? "?print=1" : ""}`);
          let printed;
          if (auto) {
            await page.waitForFunction(() => window.printCaptures.length === 1, null, { timeout: 12000 });
            printed = await page.evaluate(() => window.printCaptures[0]);
            await page.waitForFunction(() => !window.printFixture.router.state.location.search.includes("print=1"));
          } else printed = await capture(page);
          assert.match(printed.text, /Synthetic Print Patient/);
          assert.match(printed.text, /Record #9002/);
          if (role === "rhu") {
            assert.match(printed.text, /RHU HEALTH RECORD/);
            assert.match(printed.text, /Synthetic current result/);
            assert.match(printed.text, /Synthetic original result/);
            assert.match(printed.text, /Synthetic correction reason/);
          }
          assert.deepEqual(printed.overflow, []);
          assert.equal(await page.locator('iframe[title="Prepared print document"]').count(), 0);
          if (!auto) await pdf(browser, `${role}-record`, printed);
          await page.close();
        });
      }
    }
    await check("BHC referral Print Referral Slip and secure QR readiness", async () => {
      const page = await fixture(browser, "/bhc/referrals/SYN-REF-9003");
      const printed = await capture(page, "Print Referral Slip");
      assert.match(printed.text, /SYN-REF-9003/);
      assert.match(printed.text, /Synthetic Print Patient/);
      assert.match(printed.html, /data:image\/png;base64/);
      assert.doesNotMatch(printed.text, /Synthetic recorded complaint/);
      const calls = await page.evaluate(() => window.printFixture.calls);
      assert.ok(calls.some(call => call.path === "/referrals/9003/qr" && call.method === "GET"));
      assert.ok(!calls.some(call => call.path.includes("regenerate")));
      await pdf(browser, "referral-slip", printed);
      await page.close();
    });
    await check("RHU prescription Print without dispensing", async () => {
      const page = await fixture(browser, "/rhu/to-dispense");
      await page.getByRole("button", { name: "Review prescription" }).click();
      const printed = await capture(page);
      assert.match(printed.text, /Synthetic prescription instructions/);
      assert.match(printed.text, /Record #9002/);
      assert.match(printed.text, /Synthetic RHU/);
      assert.doesNotMatch(printed.text, /Close|Dispense|Review prescription/);
      assert.ok(!(await page.evaluate(() => window.printFixture.calls)).some(call => call.method !== "GET"));
      await pdf(browser, "prescription", printed);
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Review prescription" }).click();
      await capture(page);
      await page.close();
    });
    await check("Create Referral success modal Print Slip", async () => {
      const page = await fixture(browser, "/bhc/referrals/create?recordId=9002");
      await page.locator('textarea[name="reasonForReferral"]').fill("Synthetic print verification reason");
      await page.getByRole("button", { name: "Submit Referral Slip", exact: true }).click();
      await page.getByRole("button", { name: "Submit Referral", exact: true }).click();
      const before = await page.evaluate(() => window.printFixture.calls.length);
      const printed = await capture(page, "Print Slip");
      assert.match(printed.text, /SYN-REF-9003/);
      assert.ok((await page.evaluate(index => window.printFixture.calls.slice(index), before)).every(call => call.method === "GET"));
      await pdf(browser, "referral-success-modal", printed);
      await page.close();
    });
    await check("Create Referral legacy success screen Print Slip (seeded state)", async () => {
      const page = await fixture(browser, "/bhc/referrals/create?recordId=9002");
      await page.locator('textarea[name="reasonForReferral"]').waitFor();
      // This historical branch has no current submission path. Seed only the
      // in-memory success state in the synthetic fixture to exercise its button.
      await page.evaluate(() => {
        const element = document.querySelector("form");
        let fiber = element[Object.keys(element).find(key => key.startsWith("__reactFiber"))];
        while (fiber && fiber.type?.name !== "CreateReferral") fiber = fiber.return;
        let hook = fiber?.memoizedState;
        while (hook && !hook.memoizedState?.dateOfReferral) hook = hook.next;
        if (!hook) throw new Error("Referral fixture state not found");
        const submitted = hook.next;
        let tracking = submitted;
        for (let i = 0; i < 9; i++) tracking = tracking.next;
        tracking.queue.dispatch("SYN-REF-9003");
        submitted.queue.dispatch(true);
      });
      const printed = await capture(page, "Print Slip");
      assert.match(printed.text, /SYN-REF-9003/);
      assert.match(printed.html, /data:image\/png;base64/);
      await page.close();
    });
    await check("Consultation success menu Print Record (seeded saved result)", async () => {
      const page = await fixture(browser, "/bhc/consultation?patientId=9001&mode=new");
      await page.waitForFunction(() => Boolean(document.querySelector("main")));
      await page.evaluate(() => {
        const all = document.querySelectorAll("main *");
        let fiber;
        for (const element of all) {
          let candidate = element[Object.keys(element).find(key => key.startsWith("__reactFiber"))];
          while (candidate && candidate.type?.name !== "ConsultationWorkspace") candidate = candidate.return;
          if (candidate) { fiber = candidate; break; }
        }
        let hook = fiber?.memoizedState;
        while (hook) {
          // saving, saveSuccess, four notice states, two refs, validationErrors,
          // selectedPatientId: identify the existing saved-result state.
          if (hook.queue && hook.memoizedState === false && hook.next?.queue && hook.next.memoizedState === null) {
            let candidate = hook;
            for (let i = 0; i < 9 && candidate; i++) candidate = candidate.next;
            if (candidate?.memoizedState === "9001") {
              hook.next.queue.dispatch({ recordId: "9002", referralSubmitted: false });
              return;
            }
          }
          hook = hook.next;
        }
        throw new Error("Consultation fixture saved-result state not found");
      });
      await page.getByRole("button", { name: "Print Record", exact: true }).click();
      await page.waitForFunction(() => window.printCaptures.length === 1, null, { timeout: 12000 });
      assert.match(await page.evaluate(() => window.printCaptures[0].text), /Record #9002/);
      await page.close();
    });
    for (const [name, route, action] of [
      ["long-health-record", "/bhc/health-records/9002", "Print"],
      ["long-rhu-record", "/rhu/health-records/9002", "Print"],
      ["long-prescription", "/rhu/to-dispense", "Print"],
    ]) {
      await check(`${name} multi-page narrative/table`, async () => {
        const page = await fixture(browser, route, "&long=1");
        if (route.endsWith("to-dispense")) await page.getByRole("button", { name: "Review prescription" }).click();
        const printed = await capture(page, action);
        assert.match(printed.text, route.endsWith("to-dispense") ? /instruction 100/ : /Clinical paragraph 100/);
        if (!route.endsWith("to-dispense")) assert.match(printed.text, /Synthetic medicine 90/);
        await pdf(browser, name, printed);
        await page.close();
      });
    }
    await check("QR loading failure blocks printing and Retry printing succeeds", async () => {
      const page = await fixture(browser, "/bhc/referrals/SYN-REF-9003");
      await page.getByRole("button", { name: "Print Referral Slip", exact: true }).waitFor();
      await page.evaluate(() => { window.printFixture.fail = "/qr"; });
      await page.getByRole("button", { name: "Print Referral Slip", exact: true }).click();
      await page.getByRole("button", { name: "Retry printing", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.printCaptures.length), 0);
      await page.evaluate(() => { window.printFixture.fail = ""; });
      await page.getByRole("button", { name: "Retry printing", exact: true }).click();
      await page.waitForFunction(() => window.printCaptures.length === 1);
      await page.close();
    });
    await check("every BHC and RHU report category prints the applied view", async () => {
      const categories = {
        bhc: ["all", "epi", "maternal", "family-planning", "nutrition", "morbidity", "notifiable", "surveillance", "referrals"],
        rhu: ["overview", "patient-visits", "referrals", "epi", "maternal", "family-planning", "nutrition", "morbidity", "notifiable", "surveillance"],
      };
      for (const [role, slugs] of Object.entries(categories)) {
        const page = await fixture(browser, `/${role}/reports`);
        for (const slug of slugs) {
          await page.evaluate(route => window.printFixture.router.navigate(route), `/${role}/reports?type=${slug}`);
          await page.waitForFunction(({ role, slug }) => document.querySelector(`#${role}-report-print`)?.dataset.printKey.includes(slug.replaceAll("-", "_")), { role, slug });
          const printed = await capture(page);
          const selected = await page.locator(`#${role}-report-print`).textContent();
          assert.equal(printed.text.replace(/\s/g, ""), selected.replace(/\s/g, ""));
          if (slug === "nutrition") await pdf(browser, `${role}-nutrition`, printed);
        }
        await page.close();
      }
    });
    await check("applied nutrition age/weekly filters and Admin role/status filters survive printing", async () => {
      const page = await fixture(browser, "/bhc/reports?type=nutrition");
      await page.getByRole("button", { name: "Filter", exact: true }).click();
      await page.getByLabel("Reporting period", { exact: true }).selectOption("weekly");
      await page.getByLabel("Age group", { exact: true }).selectOption("0-4");
      await page.getByRole("button", { name: "Apply Filters", exact: true }).click();
      const printed = await capture(page);
      assert.match(printed.text, /Age 0-4/);
      assert.doesNotMatch(printed.text, /Filter|Apply Filters/);
      const key = await page.locator("#bhc-report-print").getAttribute("data-print-key");
      assert.match(key, /0-4/);
      assert.doesNotMatch(printed.text, /Nutrition classified adults\s+1/);
      await page.close();
      const admin = await fixture(browser, "/admin/reports");
      await admin.getByRole("button", { name: "Filter", exact: true }).click();
      await admin.getByLabel("Role", { exact: true }).selectOption("bhc");
      await admin.getByLabel("Account status", { exact: true }).selectOption("active");
      await admin.getByRole("button", { name: "Apply Filters", exact: true }).click();
      const filtered = await capture(admin);
      assert.match(filtered.text, /BHC/);
      assert.match(filtered.text, /Active/);
      assert.match(filtered.text, /Filtered registered total\s+4/);
      await admin.close();
    });
    for (const program of ["Maternal", "Family Planning", "EPI", "TB DOTS"]) {
      await check(`${program} record keeps its program form with missing optional fields`, async () => {
        const page = await fixture(browser, "/bhc/health-records/9002", `&program=${encodeURIComponent(program)}`);
        const printed = await capture(page);
        assert.match(printed.text, /Not recorded/);
        assert.match(printed.text, program === "Maternal" ? /PRENATAL|MATERNAL/ : program === "Family Planning" ? /FAMILY PLANNING/ : program === "EPI" ? /IMMUNIZATION/ : /TB/);
        await pdf(browser, `program-${program.replaceAll(" ", "-").toLowerCase()}`, printed);
        await page.close();
      });
    }
    await check("failed report/linked patient/laboratory loads block printing and retry reads data", async () => {
      for (const [route, failure] of [["/bhc/reports", "/patients"], ["/rhu/health-records/9002", "/laboratory-tests"], ["/bhc/health-records/9002", "/patients/9001"]]) {
        const page = await fixture(browser, route);
        await page.getByRole("button", { name: "Print", exact: true }).waitFor();
        await page.evaluate(async (failure) => {
          window.printFixture.fail = failure;
          await window.printFixture.client.refetchQueries();
        }, failure);
        const visible = page.getByRole("button", { name: "Print", exact: true });
        if (await visible.count()) {
          await visible.click();
          await page.getByRole("button", { name: "Retry printing", exact: true }).waitFor();
          assert.equal(await page.evaluate(() => window.printCaptures.length), 0);
          await page.evaluate(() => { window.printFixture.fail = ""; });
          await page.getByRole("button", { name: "Retry printing", exact: true }).click();
          await page.waitForFunction(() => window.printCaptures.length === 1);
        } else {
          assert.equal(await page.evaluate(() => window.printCaptures.length), 0);
          await page.evaluate(async () => { window.printFixture.fail = ""; await window.printFixture.client.refetchQueries(); });
          await capture(page);
        }
        await page.close();
      }
    });
    await check("blocked dialog has a clear retry and releases the frame", async () => {
      const page = await fixture(browser, "/bhc/reports", "", "blocked");
      await page.getByRole("button", { name: "Print", exact: true }).click();
      await page.getByRole("button", { name: "Retry printing", exact: true }).waitFor();
      assert.match(await page.locator("body").innerText(), /browser did not open the print dialog/);
      assert.equal(await page.locator('iframe[title="Prepared print document"]').count(), 0);
      assert.equal(await page.evaluate(() => window.printCaptures.length), 0);
      await page.close();
    });
    await check("isolated print works under AKAY production CSP", async () => {
      const page = await fixture(browser, "/bhc/reports", "", "complete", true);
      await capture(page);
      await page.close();
    });
    await check("missing document image blocks output and can be retried", async () => {
      const page = await fixture(browser, "/bhc/health-records/9002");
      await page.getByRole("button", { name: "Print", exact: true }).waitFor();
      await page.evaluate(() => {
        const img = document.createElement("img");
        img.src = "data:image/png;base64,broken";
        img.id = "synthetic-broken-print-image";
        document.querySelector("#health-record-print").appendChild(img);
      });
      await page.getByRole("button", { name: "Print", exact: true }).click();
      await page.getByRole("button", { name: "Retry printing", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.printCaptures.length), 0);
      await page.evaluate(() => document.querySelector("#synthetic-broken-print-image").remove());
      await page.getByRole("button", { name: "Retry printing", exact: true }).click();
      await page.waitForFunction(() => window.printCaptures.length === 1);
      await page.close();
    });
    await check("missing afterprint does not prevent the next print", async () => {
      const page = await fixture(browser, "/bhc/reports", "", "no-afterprint");
      await capture(page);
      await capture(page);
      assert.equal(await page.evaluate(() => window.printCaptures.length), 2);
      await page.close();
    });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
    console.log(`Artifacts: ${output}`);
    if (results.some(result => result.status === "failed")) process.exitCode = 1;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
