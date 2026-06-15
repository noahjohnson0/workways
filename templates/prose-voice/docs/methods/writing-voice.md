# Writing voice: kill the AI tells

What makes prose read as machine-written is sentence *shapes*, not vocabulary.
Banning hype words ("revolutionary," "powerful," "seamless") and em-dashes is
necessary and does not catch it. A piece can be clean on every word and still
read as AI because of its constructions. This is the checklist that catches the
constructions, plus a scanner that flags the mechanical ones.

## The banned constructions

Each of these is a *shape*. Rewrite it as a plain statement.

- **Antithesis ("not X, it's Y")**: "the differentiator isn't which model is
  smartest, it's which one is steady." The single biggest tell. Split into two
  flat sentences: "The models are about equally smart. They are not equally
  consistent."
- **Aphoristic header-sentences ("The only X is Y")**: "The only fair test is one
  the agent never sees." Replace with the literal fact: "I kept the tests in a
  folder the agent could not read."
- **"The real X is..." reveals**: "the real lesson is cheaper than any of them."
  State the lesson directly.
- **Rhetorical question then answer**: "Why not a dependency? Because half of it
  is bash." Cut the question, keep the answer: "It ships as files, not a
  dependency, because half of it is bash."
- **Reveal narration**: "Here is where I was wrong, so I am going to show my
  work." Show the work without announcing it.
- **One-sentence drama paragraphs** dropped for effect. Fold them into the
  surrounding paragraph.
- **Rule-of-three triads** for rhythm ("a 40-file repo, a vague ticket, knowing
  which abstraction already exists"). Use two items, or four, or a plain list.
- **Bolded mini-thesis on *every* paragraph**. One or two bold leads per piece
  aid skimming. Applied to every paragraph it reads like an AI listicle. Let
  tables and plain prose carry most of it.
- **Em-dash, en-dash, and the `" - "` substitute**. Rebuild the aside with a
  comma, a colon, parentheses, or two sentences. Use "to" for ranges ("98 to
  100%", not "98-100%").

**Why:** Surface rules ban words. These rules ban shapes. The shapes are what a
reader clocks as "an AI wrote this," even when the vocabulary is clean.

## Default register: flat and technical

When in doubt, write like an engineer's changelog, not an essay. Short
declaratives. Findings stated plainly. Tables and numbers do the skimming. The
confidence comes from the facts, not from rhetorical flourish. Reserve any
flourish for one or two places in a whole piece.

**Why:** Flat prose has nowhere to hide a tell. The tics above all need a
rhetorical frame to live in; remove the frame and they have no home.

## No tool fixes this

"AI humanizer" rewriters and detector-dodging passes are snake oil: they swap
synonyms, add typos, and make the prose worse, and the detectors they target are
unreliable anyway. The fix is the checklist above applied while writing, plus a
mechanical scan for the tells that are easy to grep.

## The scanner

`scripts/prose-scan.mjs <files...>` flags the mechanical tells: em-dashes and
en-dashes, `" - "` asides, antithesis, "the real X is", aphorisms, hype words,
and fence-sitting closers. It exits non-zero when it finds anything, so it drops
straight into a pre-commit hook or CI step.

```bash
node scripts/prose-scan.mjs content/**/*.md
```

The scan only catches the regex-able tells. It will not flag a rule-of-three or a
reveal-narration; those stay a human read. Treat a clean scan as necessary, not
sufficient.

## Adapting

The banned list is the durable part. The register is a default, not a law: a
personal essay can carry more voice than a changelog. Keep the spirit, that a
reader should not be able to name the construction you reached for, and tune the
scanner's word lists to your own repeated tics.
