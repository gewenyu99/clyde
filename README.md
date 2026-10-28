# Clyde

Teach your agent to think like a writer.

A writer knows why every part of a piece is there. An agent editing your draft doesn't. It sees the paragraph in front of it, makes it read better, and drops the job that paragraph did for the piece. Clyde keeps those reasons beside your draft and makes the agent check them before every edit.

> **Clyde is in design.** Nothing installs yet. The design is in [docs/design.md](docs/design.md), and the rulings it follows are in [docs/plan.md](docs/plan.md).

- **When you need it.** You revise an essay, a chapter or a doc with Claude Code, and the agent's edits drift from what the piece is for.
- **What you get.** A scaffold of the piece's goals and choices that the agent points at before each edit, and a pane where you confirm the ones that shape the piece.

## The principles

Each principle names the writing method it comes from and why that method works. Every source is in [docs/sources.json](docs/sources.json).

1. **Every part serves the one above it.** Each section, paragraph and sentence has one job, and that job serves the one above it, up to the main goal. Writers compose from a network of goals and sub-goals ([Flower and Hayes](https://isfd87-bue.infd.edu.ar/sitio/material-bibliografico-de-interes-para-docentes-que-se-desempenen-en-el-nivel-superior/upload/Flowers_y_Hayes.pdf)), and the [pyramid principle](https://www.barbaraminto.com/concept) groups ideas the same way. Writers who outlined first wrote better documents, since the outline took load off their attention ([Kellogg](https://scholarsmine.mst.edu/psysci_facwork/284)).
2. **Point and call on every edit.** Before an edit, the agent points at the span, names the job it does, and calls out what a reader takes away after the change. Clyde enforces this with tools that are deterministic and blocking, so the agent can't skip the step. Japanese rail crews do the same with each signal before they act, a practice called shisa kanko. In a lab test it cut errors from 2.38 to 0.38 per 100 responses, for about a third of a second each ([Haga, Akatsuka and Shiroto](https://www.jstage.jst.go.jp/article/jaiop/9/2/9_107/_article)). After 100 routine signals, 5 of 12 staff pressed the habitual key on the first red without it, and none of 12 with it.
3. **The text can overrule the plan.** When an edit and the scaffold disagree, fixing the text and updating the goal are equal options. Writers change their goals as they learn what the piece is about ([Flower and Hayes](https://isfd87-bue.infd.edu.ar/sitio/material-bibliografico-de-interes-para-docentes-que-se-desempenen-en-el-nivel-superior/upload/Flowers_y_Hayes.pdf)), and experienced writers revise to find the shape of their argument ([Sommers](https://openlab.citytech.cuny.edu/fywpd/files/2019/01/sommors-revision-strategies.pdf)). Your own edits win by default.
4. **Commitments live in one record.** A term, a voice or a promise to the reader holds for the whole piece, so it lives in one record the piece is checked against. Copy editors keep a [style sheet](https://editors.ca/publications/professional-editorial-standards/copy-editing/) so one decision applies everywhere. The Frasier writers kept [a bible](http://www.janeespenson.com/archives/00000550.php) of everything established, so no fact drifted.
5. **A change makes only its dependents suspect.** When a goal or a commitment changes, only the records that depended on it get flagged. Requirements tools like [IBM DOORS](https://www.ibm.com/docs/SSYMRC_7.2/com.ibm.jazz.vvc.doc/topics/c_linkval.html) mark a link suspect when either end changes. Flags stay narrow, since developers who find one stale comment stop trusting the rest ([Siy et al., quoted in Ibrahim et al.](https://sailresearch.github.io/sail-website/data/pdfs/JSS_OnTheRelationshipBetweenCommentUpdatePracticesAndSoftwareBugs.pdf)).
6. **Reasons need a source.** Every stored reason records who stated it, how and when. People explain their own choices from plausible theories rather than memory ([Nisbett and Wilson](https://web.math.princeton.edu/~sswang/literature_general_unsorted/Nisbett-Wilson-PsychologicalReview1977.pdf)), and model explanations rationalize biases they never mention ([Turpin et al.](https://arxiv.org/abs/2305.04388)). So a fresh subagent judges each edit from the diff, never from the agent's account of it.
7. **The agent proposes, you confirm.** The agent drafts the scaffold, and you accept or reject the changes that shape the piece, from section level up. Rationale tools live or die on capture, since writing reasons down has to pay off right away ([Buckingham Shum et al.](https://research-archive.stem.open.ac.uk/stemra-data/uploads/files/KMI-05-18.pdf)). So the agent asks only when an edit departs from the plan ([Lee](http://users.cs.northwestern.edu/~paritosh/papers/sketch-to-models/LeeDesignRationaleSystems.pdf)).
8. **Draft first, check later.** In draft mode the agent still calls each edit, but no check runs. Editing while you produce words damps your voice ([Elbow](https://www.research.ucsb.edu/sites/default/files/RD/docs/FREEWRITING-by-Peter-Elbow.pdf)), so checks start once you confirm a main goal.
9. **Loose ends are findings, not rewrites.** Check lanes flag a setup with no payoff, a dropped idea, an open question, a term used two ways, numbers that disagree, claims that contradict and voice drift. Chekhov wouldn't put [a loaded rifle on stage](https://chehov-lit.ru/chehov/letters/1888-1889/letter-707.htm) if nobody meant to fire it, and the [given-new contract](https://web.stanford.edu/~clark/1970s/Clark,%20H.H.%20_%20Haviland,%20S.E.%20_Comprehension%20and%20the%20given-new%20contract_%201977.pdf) wants one antecedent for every term a reader is meant to know. You decide what to change.

## How a session goes

You write in your own editor and talk to the agent in Claude Code. A scaffold pane sits beside the chat. It shows the main goal, each section's job and the commitments, and it never edits your prose.

The agent changes a tracked file only through `clyde_edit`, so the call travels with the edit:

```json
{
  "file": "essays/garden.md",
  "point": "Sets up the drought before the essay explains the new beds.",
  "call": "The reader knows the summer was dry and the old beds failed.",
  "change": "meaning",
  "old": "It was a hard summer for the garden.",
  "new": "No rain fell from June to August, and the old beds cracked."
}
```

From there, clyde runs the same order every time.

1. **The edit lands.** Clyde writes it through Claude Code's own Edit tool, so your usual permission prompt still applies.
2. **A check opens.** The agent spawns a `clyde:check` subagent on Opus. It sees only the diff and the scaffold, and its one tool records a verdict. Clyde refuses the next edit to that section until the verdict lands.
3. **The turn ends on lanes.** Before the turn can end, the agent runs the lanes that triage picks over the sections it changed. Only Release in the pane, or `/clyde release`, ends a held turn early.
4. **You confirm the shape.** Changes at section level and up wait in the pane for your click or a typed `/clyde` command.

Clyde itself judges nothing. It makes no model calls, and every judgment comes from the agent's Opus subagents. A check costs about $0.05 to $0.10 of the agent's own session.

## Where records live

Clyde keeps its records on your machine, in a helper called `clyded` that owns one SQLite database. Nothing goes in your project or in git, and there's no hosted service or account. To move a piece to another machine, run `/clyde export` on the old one and `/clyde import` on the new one.

## Install

Clyde isn't released yet. Once it is, you'll install it from Claude Code:

```
/plugin install clyde --marketplace gewenyu99/clyde
```

Then run `/clyde init <file>` on the piece you're revising. Claude Code comes first, and an MCP server for other agents ships second on the same core.

See also: [Design](docs/design.md) · [Rulings](docs/plan.md) · [Sources](docs/sources.json)
