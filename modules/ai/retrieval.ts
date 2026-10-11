export type RuleExcerpt = {
  id: string;
  description: string;
  source_page: string;
  source_section: string;
  level: number;
  department_code: string;
};
const stopwords = new Set(
  "a an and are as at be by do for from how i in is it of on or that the this to what when which with".split(
    " ",
  ),
);
/** Deterministic lexical retrieval only; never cut a citation or excerpt mid-record. */
export function retrieveRuleExcerpts(
  question: string,
  candidates: RuleExcerpt[],
  metadata: Record<string, unknown>,
  maxPromptCharacters = 22000,
) {
  const terms = [
    ...new Set(question.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []),
  ].filter((term) => term.length > 1 && !stopwords.has(term));
  const ranked = candidates
    .map((source) => {
      const text =
        `${source.description} ${source.source_section} ${source.department_code.replaceAll("_", " ")} level ${source.level}`.toLowerCase();
      const words = new Set(text.match(/[\p{L}\p{N}_]+/gu) ?? []);
      return {
        source,
        score: terms.reduce(
          (score, term) => score + (words.has(term) ? 1 : 0),
          0,
        ),
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id),
    );
  const sources: RuleExcerpt[] = [];
  const serialize = () =>
    JSON.stringify({
      question,
      rule_version: metadata,
      retrieval: {
        available: candidates.length,
        selected: sources.length,
        method:
          "lexical relevance; bounded excerpts; omitted sources may contain relevant policy",
      },
      sources,
    });
  if (serialize().length > maxPromptCharacters)
    throw new Error("Source metadata exceeds context limit");
  for (const { source } of ranked) {
    sources.push(source);
    if (serialize().length > maxPromptCharacters) sources.pop();
    if (sources.length >= 40) break;
  }
  return { sources, prompt: serialize(), available: candidates.length };
}
