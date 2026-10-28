# Plan

## Rulings

- **Core message.** "Teach your agent to think like a writer." The README leads with it, and every other piece of copy supports it.
- **Core principles are a list.** The README states them as a list under the core message.
- **Pointing and calling is a principle.** The agent stays on track through literal tools that are deterministic and blocking, so the writing process gets followed. Before an edit, the agent points at the span and the goal it serves and calls out what the edit changes. A hook blocks the edit until it has. Cite the railway safety origin (shisa kanko) and its measured effect from a verified source.
- **Cite the methods in the copy.** The README and docs name each writing method the design draws on, like Minto's pyramid or Flower and Hayes's goal network, and say in a sentence why it works. Sources come from the verified research only.
- **Workflow.** like-vincent `plan`, then `code`. The grill runs at the L1 checkpoint, after the map is pitched.
- **Product shape.** A Claude Code plugin with a live scaffold pane beside the chat, built on a core that holds the scaffold format and the checks. Installs with `/plugin install clyde --marketplace gewenyu99/clyde`.
- **Where the writer writes.** In their own editor, talking to the agent in Claude Code. The pane reads the scaffold and accepts or rejects the agent's proposed changes. It never edits prose.
- **Other agents.** An MCP server with an MCP Apps widget ships second, on the same core, with Codex and Cursor hooks blocking where they exist. A standalone app and editor extensions wait until a writer asks.
- **First design without the grill.** Vincent said "go for a initial first design", so the grill was skipped. The recommendations R1 to R20 in [design.md](design.md) are rulings until he overturns one by number.
- **No records in git (overturns R1).** No scaffold record is committed or stored in git. Committed files are a bad idea for this. If the mod can't run SQLite, find another way: a separate process, a standalone app or a service are all acceptable when the design needs one.
- **Almost every edit gets a call (replaces R2).** Changing even simple wording affects meaning, so almost no edit to a tracked manuscript goes through without a point and call. An edit never needs more than one call. Which edits, if any, go through without one is clyde's design call.
- **Local only, nothing hosted.** Clyde runs entirely on the writer's machine. No hosted relay, no accounts and no service, for now. Records live in the local helper's store and nowhere else.
- **Clyde is deterministic.** Clyde is just a tool. It does no inference and makes no model calls. Every judgment about meaning comes from the agent, which runs on Opus. Clyde's tools stay deterministic and blocking.
- **Clyde blocks on checks the agent runs.** After an edit, clyde blocks the next edit to that section until the agent records a verdict on it, from a fresh subagent that sees only the diff and the scaffold. Clyde blocks the end of the turn until the agent has run the check lanes over the sections it changed and recorded the findings. Clyde enforces the order and judges nothing.
- **Turn-end lanes are triaged.** At turn end, code triage picks the lanes over the changed sections, at most 4 lane runs and 1 refute a turn, the way like-vincent's triage picks review lanes. Every open edit check still runs.
- **Pulls and same-branch commits stay unclaimable.** A pull, reset or commit that changes the manuscript on the same branch maps as git, with Reviewed and no This was me.
- **Writer acts typed mid-turn wait.** A writer-level command or quote typed while an agent tool call or background command runs waits in the pane for one click. One typed while nothing runs applies right away.
- **Writer confirms section level and up (keeps R4, open).** R4 stays, written as an explicit design choice that's open to question. The design records, as future work, the situations where the line should move.
- **Opus judges meaning (replaces R12's model).** Every judgment about meaning, semantics or style runs on Opus. Sonnet and Haiku never make those judgments, since Vincent has seen them fall short again and again. Checks that code can make stay code. The lane budget is clyde's recommendation.
- **Check lanes.** The pane shows findings from check lanes, the way like-vincent's review lanes work. Lanes include unfinished ideas (a setup with no payoff, a promise to the reader not kept, an idea raised and dropped, an open question) and inconsistencies (a term used two ways, facts or numbers that disagree, claims that contradict, voice drift).
