import { Button } from "@/components/ui/button";
import {
  departments,
  departmentLabels,
} from "@/modules/program-rules/contracts";
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field-label">
      {label}
      {children}
    </label>
  );
}
export function FormPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="panel">
      <summary className="cursor-pointer py-2 font-semibold">{title}</summary>
      <div className="mt-5">{children}</div>
    </details>
  );
}
export function DepartmentSelect({
  allowEmpty = false,
}: {
  allowEmpty?: boolean;
}) {
  return (
    <select name="department_code" required={!allowEmpty}>
      {allowEmpty && <option value="">Primary mentor (all departments)</option>}
      {departments.map((code) => (
        <option key={code} value={code}>
          {departmentLabels[code]}
        </option>
      ))}
    </select>
  );
}
export function SaveButton({
  children = "Save",
}: {
  children?: React.ReactNode;
}) {
  return <Button type="submit">{children}</Button>;
}
export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
