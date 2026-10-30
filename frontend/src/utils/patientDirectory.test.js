import test from "node:test";
import assert from "node:assert/strict";

import { showDirectoryRegisterAction } from "./patientDirectory.js";

test("RHU All Patients does not offer a register action; BHC still does", () => {
  assert.equal(showDirectoryRegisterAction("rhu"), false);
  assert.equal(showDirectoryRegisterAction("bhc"), true);
  assert.equal(showDirectoryRegisterAction("admin"), true);
});
