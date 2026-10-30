---
"show-sidekick": minor
---

Add a review queue for finished cuts. `showkick queue [--json] [--all]` lists every episode waiting on a human (a cut at the final gate, a run halted by a critical finding, or a failed run) with its build id, creative summaries, open findings, and cost. `showkick reject` rejects an episode, `showkick revise --stage <slug>` sends notes back to an earlier stage and reruns from there, and `approve`, `revise`, and `reject` take `--build <id>` so a decision only applies to the cut that was watched.
