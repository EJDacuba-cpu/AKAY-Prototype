import { FieldInput, FieldTextarea } from "./fields/ClinicalFields";
import { DatePickerField } from "../../common/forms/DatePickerField";

function fieldError(errors, prefix, name) {
  return errors[`${prefix}.${name}`] || "";
}

export default function BhcLaboratoryFields({ entry, onChange, errors = {}, prefix = "", disabled = false }) {
  function change(key, value) {
    onChange({ ...entry, [key]: value, resultStatus: "Result Available" });
  }

  return (
    <div className="grid gap-4 @xl:grid-cols-2">
      <FieldInput
        label="Test Name"
        required
        name={`${prefix}.testName`}
        maxLength={255}
        value={entry.testName || ""}
        disabled={disabled}
        error={fieldError(errors, prefix, "testName")}
        onChange={(event) => change("testName", event.target.value)}
      />
      <DatePickerField
        label="Date Performed"
        required
        name={`${prefix}.examinationDate`}
        value={entry.examinationDate || ""}
        disabled={disabled}
        disableFuture
        error={fieldError(errors, prefix, "examinationDate")}
        onChange={(value) => change("examinationDate", value)}
      />
      <FieldInput
        label="Result Source"
        required
        name={`${prefix}.resultSource`}
        maxLength={150}
        value={entry.resultSource || ""}
        disabled={disabled}
        error={fieldError(errors, prefix, "resultSource")}
        placeholder="Type where this result came from"
        onChange={(event) => change("resultSource", event.target.value)}
      />
      <FieldTextarea
        label="Laboratory Result"
        required
        name={`${prefix}.result`}
        maxLength={10000}
        rows={3}
        value={entry.result || ""}
        disabled={disabled}
        error={fieldError(errors, prefix, "result")}
        onChange={(event) => change("result", event.target.value)}
        wrapperClassName="@xl:col-span-2"
      />
      <FieldTextarea
        label="Remarks"
        name={`${prefix}.remarks`}
        maxLength={1000}
        rows={2}
        value={entry.remarks || ""}
        disabled={disabled}
        error={fieldError(errors, prefix, "remarks")}
        onChange={(event) => change("remarks", event.target.value)}
        wrapperClassName="@xl:col-span-2"
      />
    </div>
  );
}
