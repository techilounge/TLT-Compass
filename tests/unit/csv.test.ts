import { describe, expect, it } from "vitest";
import { csvCell, csvDocument } from "../../lib/validation/csv";
describe("private record CSV encoding", () => {
  it("quotes commas, quotes, newlines and preserves Unicode", () => {
    expect(csvCell('Trail, "A"\nJosé')).toBe('"Trail, ""A""\nJosé"');
    expect(
      csvDocument([
        ["alias", "value"],
        ["José", null],
      ]),
    ).toBe('\uFEFF"alias","value"\r\n"José",""\r\n');
  });
  it("neutralizes spreadsheet formulas including whitespace prefixes", () => {
    for (const input of [
      "=1+1",
      " +SUM(A1)",
      "@command",
      "-1+2",
      "\tformula",
      "\rtest",
    ])
      expect(csvCell(input)).toBe(`"'${input}"`);
  });
});
