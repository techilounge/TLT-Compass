import type { Question } from "./questions";
export function shuffledChoices(
  question: Question,
  randomInt: (max: number) => number,
) {
  const choices = question.choices.map((text, index) => ({
    text,
    correct: index === question.correct_index,
  }));
  for (let i = choices.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i)
      throw new Error("Invalid random index");
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}
