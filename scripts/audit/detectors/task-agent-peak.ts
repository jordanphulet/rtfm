import type { Event } from "../events.ts";

export type AgentRun = { agent: string; who: string; start: string; end: string };

export type TaskAgentPeak = {
  peak: number;
  /** When the peak was first reached, ISO 8601, UTC. */
  at?: string;
  running: AgentRun[];
};

const TASK_AGENT = /^subagent: [A-Z][A-Z0-9]{1,2}(?:\.[A-Za-z0-9]+)+\b/;

/** The most task agents (subagents whose description starts with a task id) running at once. */
export function taskAgentPeak(events: Event[]): TaskAgentPeak {
  const runs = taskAgentRuns(events);
  let best: TaskAgentPeak = { peak: 0, running: [] };
  for (const run of runs) {
    const running = runs.filter((other) => other.start <= run.start && run.start <= other.end);
    if (running.length > best.peak) best = { peak: running.length, at: run.start, running };
  }
  return best;
}

/**
 * When each task agent was working: from each message it was given to the end of its last event
 * before the next one (a tool call ends when its result comes back). Between them it waits for
 * the session that started it. `events` are oldest first.
 */
function taskAgentRuns(events: Event[]): AgentRun[] {
  const runs: AgentRun[] = [];
  const current = new Map<string, AgentRun>();
  for (const event of events) {
    if (!event.agent || !TASK_AGENT.test(event.who)) continue;
    const run = current.get(event.agent);
    const end = event.resultTime ?? event.time;
    if (run && event.kind !== "prompt") {
      if (end > run.end) run.end = end;
    } else {
      const started = { agent: event.agent, who: event.who, start: event.time, end };
      runs.push(started);
      current.set(event.agent, started);
    }
  }
  return runs;
}
