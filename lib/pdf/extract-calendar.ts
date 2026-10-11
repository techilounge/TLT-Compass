import { spawn } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
const outputSchema = z.object({
  pages: z
    .array(
      z.object({
        page: z.number().int().min(1).max(30),
        lines: z.array(z.string().max(20000)).max(20000),
      }),
    )
    .max(30),
});
/** Isolate untrusted parsing from request credentials and bound heap, output and runtime. */
export async function extractCalendarPdf(base64: string) {
  return new Promise<z.infer<typeof outputSchema>>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--max-old-space-size=256",
        join(process.cwd(), "scripts/pdf-calendar-child.mjs"),
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
        },
      },
    );
    let output = "",
      settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        child.kill();
        reject(error);
      } else {
        try {
          resolve(outputSchema.parse(JSON.parse(output)));
        } catch {
          reject(new Error("Invalid PDF extraction output"));
        }
      }
    };
    const timer = setTimeout(
      () => finish(new Error("PDF extraction timed out")),
      20000,
    );
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 1024 * 1024)
        finish(new Error("PDF extraction exceeds output limit"));
    });
    child.stderr.resume();
    child.on("error", () =>
      finish(new Error("Unable to start PDF extraction")),
    );
    child.on("close", (code) =>
      finish(code === 0 ? undefined : new Error("PDF extraction failed")),
    );
    child.stdin.on("error", () =>
      finish(new Error("PDF extraction input unavailable")),
    );
    child.stdin.end(JSON.stringify({ base64 }));
  });
}
