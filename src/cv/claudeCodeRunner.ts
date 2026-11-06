import { spawn } from "node:child_process";

export class ClaudeCodeError extends Error {}

export type ClaudeCodeResult = {
  resultText: string;
  totalCostUsd?: number;
};

const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * Runs `claude -p` (Claude Code's non-interactive mode) as a child process, scoped to
 * only the Read and Write tools - no Bash, no network-capable tools. This matters because
 * the prompt embeds a job description scraped from the open web; a job posting could in
 * principle contain prompt-injection text, and this scoping means even a successful
 * injection can only read/write files already reachable by Claude Code, not run commands
 * or exfiltrate anything over the network.
 *
 * Uses whatever credentials the local `claude` CLI is already logged in with (the same
 * Claude subscription this project's own Claude Code sessions use) rather than a separate
 * pay-per-token Anthropic API key.
 */
export function runClaudeCode(prompt: string, cwd: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ClaudeCodeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", prompt, "--allowedTools", "Read Write", "--output-format", "json"],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new ClaudeCodeError(`claude CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new ClaudeCodeError(
          `Failed to start the claude CLI: ${err.message}. Is Claude Code installed and on PATH?`,
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(new ClaudeCodeError(`claude CLI exited with code ${code}: ${stderr || stdout}`.trim()));
        return;
      }

      let parsed: { is_error?: boolean; result?: string; total_cost_usd?: number };
      try {
        parsed = JSON.parse(stdout);
      } catch {
        reject(new ClaudeCodeError(`Could not parse claude CLI output as JSON: ${stdout.slice(0, 500)}`));
        return;
      }

      if (parsed.is_error) {
        reject(new ClaudeCodeError(`claude CLI reported an error: ${parsed.result ?? stdout}`));
        return;
      }

      resolve({ resultText: parsed.result ?? "", totalCostUsd: parsed.total_cost_usd });
    });
  });
}
