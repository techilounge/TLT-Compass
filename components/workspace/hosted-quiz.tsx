"use client";
import { useState } from "react";
import type { Question } from "@/modules/games/questions";
import { shuffledChoices } from "@/modules/games/round";
import { Button } from "@/components/ui/button";
function randomInt(max: number) {
  const buffer = new Uint32Array(1),
    bound = Math.floor(0x100000000 / max) * max;
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= bound);
  return buffer[0] % max;
}
export function HostedQuiz({ questions }: { questions: Question[] }) {
  const [round, setRound] = useState<
      {
        prompt: string;
        choices: ReturnType<typeof shuffledChoices>;
        explanation: string;
      }[]
    >([]),
    [index, setIndex] = useState(0),
    [reveal, setReveal] = useState(false),
    [count, setCount] = useState(5);
  const current = round[index];
  return (
    <section className="panel space-y-4">
      <h2>Staff-hosted quick round</h2>
      <p>
        Use approved questions for a supervised group discussion. Questions and
        answers shuffle for every new round. This practice screen does not award
        points or mark official completion.
      </p>
      <label>
        Questions per round
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        >
          {[5, 10, 20].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <Button
        disabled={!questions.length}
        onClick={() => {
          const list = [...questions];
          for (let i = list.length - 1; i > 0; i--) {
            const j = randomInt(i + 1);
            [list[i], list[j]] = [list[j], list[i]];
          }
          setRound(
            list.slice(0, count).map((q) => ({
              prompt: q.prompt,
              choices: shuffledChoices(q, randomInt),
              explanation: q.explanation,
            })),
          );
          setIndex(0);
          setReveal(false);
        }}
      >
        Start a new round
      </Button>
      {current && (
        <div aria-live="polite" className="space-y-4">
          <h3>
            Question {index + 1} of {round.length}
          </h3>
          <p>{current.prompt}</p>
          <ol>
            {current.choices.map((choice, i) => (
              <li key={i} className="py-2">
                {String.fromCharCode(65 + i)}. {choice.text}
                {reveal && choice.correct ? " · Correct" : ""}
              </li>
            ))}
          </ol>
          <Button onClick={() => setReveal(true)} disabled={reveal}>
            Reveal answer for discussion
          </Button>
          {reveal && (
            <p>
              {current.explanation ||
                "Discuss why the reviewed answer fits the question."}
            </p>
          )}
          {index + 1 < round.length && (
            <Button
              variant="outline"
              onClick={() => {
                setIndex(index + 1);
                setReveal(false);
              }}
            >
              Next question
            </Button>
          )}
        </div>
      )}
      {!questions.length && (
        <p>
          No approved questions yet. Import and review the source CSV first.
        </p>
      )}
    </section>
  );
}
