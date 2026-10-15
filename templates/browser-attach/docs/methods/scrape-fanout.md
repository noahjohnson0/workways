# Scrape fan-out: parallel scanners, JSONL on disk, live local page

A method for "search this site and give me a comparison of everything you find".
It replaces the obvious approach (one agent, one long conversation, results
returned as prose) with something that scales and does not lose data.

## The problem with the obvious approach

Browser tool results are the bottleneck, not the browsing:

- Tool output truncates. Extension `javascript_tool` results cut off around 1100
  characters, so a page of 40 listings cannot come back in one call.
- Every returned row costs context twice: once arriving, once when you restate it.
- One agent doing 60 detail-page visits sequentially takes 15 minutes of wall clock
  and fills its window with page text it will never need again.
- If the run dies at listing 45, everything is gone.

## The shape

**Coordinator** writes a shared brief, spawns N scanner subagents, and owns the
output. **Scanners** each get a disjoint slice of the query space and their own
browser tab, and append results as JSONL to their own file. **The page** reads
whatever is on disk right now.

```
BRIEF.md            shared rules: what to look for, what to reject, output schema,
                    site gotchas, tool limits
listings/a.jsonl    scanner A appends one JSON object per line, as it finds them
listings/b.jsonl    scanner B
listings/c.jsonl    ...
build.py            reads every *.jsonl, dedupes on id, derives columns, writes
                    site/index.html + site/data.json + a ranked .md
site/               python3 -m http.server, page polls data.json every 8s
```

Four scanners covering four query families took about 14 minutes of wall clock
and produced 59 rows, versus a sequential run that would have been an hour.

## Rules that make it work

**One file per scanner, append-only.** No shared file, so no interleaved writes and
no locking. Dedupe happens later in the build, on a stable id from the source URL.

**Tell them to write each line the moment they have it, not to batch at the end.**
That is what makes the page fill in live, and it means a scanner that dies still
leaves everything it found. Say so explicitly in the brief; agents default to
saving up their output.

**Put the schema in the brief, with `null` allowed.** Add a line saying a `null` is
more useful than a guess, or you get invented specs. Ask for a `verdict` sentence
per row so the reasoning survives the agent that produced it.

**Give the brief the tool gotchas, not just the task.** Each scanner otherwise
rediscovers the same timeouts and truncation limits at full token cost. The
site-specific subskill in this cluster is where those live; point at it.

**Slices should be query families, not page ranges.** Scanners then fail
independently and interestingly: one coming back empty is a real finding about the
market, not a gap in coverage.

**Expect a scanner to come back with nothing, and reassign it.** In one run a whole
category returned zero because the search params were being ignored for those terms.
Resuming that agent with different queries and a hypothesis about the cause turned
an empty file into the run's best find. A scanner that finishes early is idle
capacity, not a finished job.

**Coordinator never reads a subagent transcript file.** They are enormous. Read the
JSONL and the completion summary.

## The live page beats a returned table

Build a static page that fetches `data.json` on a timer rather than one that has the
data baked in:

```js
let lastLen = DATA.length;
setInterval(async () => {
  const d = await fetch("data.json?t=" + Date.now()).then(r => r.json());
  if (d.rows.length !== lastLen) { lastLen = d.rows.length;
    DATA.length = 0; DATA.push(...d.rows); render(); }
}, 8000);
```

with a rebuild loop next to it:

```sh
while :; do python3 build.py >/dev/null 2>&1; sleep 15; done
```

The user watches rows appear while the scan runs, instead of waiting for a final
report. Kill the rebuild loop when the scanners finish.

Serve it locally (`python3 -m http.server 8787 --directory site`) rather than
publishing it. A scan in progress is working state, and a local page can poll a file
on disk, which a published one cannot.

## Derive the decision column

Raw scraped specs are not a decision. Compute the number that actually answers the
question and sort on it: for CI runner hardware that was concurrent job containers,
`min(cores * 2 // 2, ram_gb // 2)` against the documented per-job limits, plus
dollars per core. Put the source of the constant in the page footer so the number is
auditable.

Infer what the listing does not say, where it is safely derivable. CPU launch year
comes out of the model string with a lookup table (`i7-13700T` -> 2023,
`E5-2699 v3` -> 2014), and it predicts idle power and instructions-per-clock better
than anything a seller writes.
