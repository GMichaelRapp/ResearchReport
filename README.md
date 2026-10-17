# Research Report Builder

Put everything you found about a topic into one branded report, and save it as a PDF. The report is built for a reader who has to decide what to do with the topic: how deep it runs, what to watch out for, where people disagree, and how good the sources are.

A finished report has these parts:

- a branded cover with the question, the depth rating, and the confidence
- a contents page with page numbers
- a one-page **bottom line**: the summary, a depth rating with what makes the topic deep, the recommended treatment, the research basis, your confidence, key takeaways, and the decisions you need from the reader
- **key considerations**: sensitivities, legal and accuracy risks, audience, timing, and common misconceptions set against what the research shows
- **the research** itself, in numbered sections with footnotes, charts, and tables
- **debates and open questions**: each disagreement with its views and your assessment, and what would settle each open question
- **reference**: key actors, a timeline, and terms
- **source assessment**: every source graded, annotated, and grouped as core, supporting, or further reading
- lettered appendices
- an "About this report" page with method, handling, version history, and your logo

Every page carries a running header, the handling marking, and a page number. Any part can be turned off.

It is one web page. There is nothing to install, no account, and nothing is sent anywhere. It is a sibling of the [White Paper Builder](https://gmichaelrapp.github.io/WhitePaperBuilder/), and the writing works the same way.

## Using it

Open `index.html` in Chrome or Edge, or use the hosted copy linked in this repository's About box. Chrome and Edge print the pages most faithfully.

The tabs on the left hold the report. The pages on the right update as you type. The panel above the pages lists anything to **fix**, **check**, or **note**; click a line to go to the tab it concerns.

| Tab | What goes there |
|---|---|
| **Report** | Title, the question the report answers, prepared for and by, date, number, version, status, short title, cover image, and which parts to include |
| **Brand** | Organization, tagline, logo, the report's name and number prefix, the handling marking, accent and ink colors, page color, website, contact, disclaimer, and rights line |
| **Bottom line** | The summary, depth rating and its dimensions, treatment, research basis, confidence, takeaways, and decisions |
| **Considerations** | Labeled considerations and common misconceptions |
| **Research** | The research text |
| **Debates** | Debates, each with its views and an assessment, and open questions |
| **Reference** | Key actors, a timeline, and terms |
| **Visuals** | Charts, tables, timelines, key numbers, and images |
| **Sources** | Sources from OSINT Citation Generator list files, with a grade, an annotation, and a group for each |
| **Appendix** | Appendices, with the same markup as the research |
| **About** | Method, handling and distribution, and version history |

A new report starts from the template. Its guidance is in [square brackets]; replace it as you write. `examples/sample-report.json` is a filled-in report on an invented topic; open it with **Open project** to see every part in use, or look at `examples/sample-report.pdf`.

### Brand

Set the brand once. It stays in the browser when you start a new report, and **Save brand** writes it to a file you can open on another computer or keep beside other brands. The logo shows on the cover and the last page; a PNG or SVG with a transparent background works best. The marking (for example "Internal: for editorial use") prints as a strip on the cover and at the foot of every page.

The checks warn you if the ink color is too light to read or the accent too faint to see.

### The bottom line

This page is for a reader who will read nothing else, and it is meant to fit on one page; the checks say when it runs over.

- **Depth** runs from 1 to 5: Light (a short piece covers it), Moderate, Substantial, Deep, and Very deep (a series or ongoing coverage).
- **What makes it deep**, one per line: `Complexity | High | Many actors, technical terms`. Levels are Low, Moderate, or High.
- **Research basis** is your own line, plus the count of sources and how many are rated A or B, which the page adds.
- **Confidence** is High, Moderate, or Low, with standard wording unless you give your own reason.
- **Key takeaways**, one per line. End a line with `| High`, `| Moderate`, or `| Low` to show your confidence in it.
- **For your decision**, one per line, numbered D1, D2.

### Considerations, debates, and reference

| Field | One per line |
|---|---|
| Considerations | `Legal \| Do not predict the ruling as fact.` The label prints in the margin. |
| Misconceptions | `What is often said \| What the research shows` |
| Open questions | `The question \| What would settle it` |
| Key actors | `Who \| What they are \| Why they matter` |
| Timeline | `March 3, 2022, What happened` |
| Terms | `Term \| What it means` |

Debates are written in blocks:

```
? Does the treaty cover the outer anchorage?
+ Expansive reading: who holds it, and their best evidence.
+ Narrow reading: who holds it, and their best evidence.
= Where the evidence points, and how sure you are.
```

A label before a colon on a `+` line prints above that view.

### Writing the research

| Type this | To get |
|---|---|
| `# Title` | A numbered section, starting a new page. You can turn the new pages off under Report. |
| `## Title` | A numbered subsection: 2.1, 2.2 |
| `### Title` | A small heading, not numbered |
| a blank line | A new paragraph |
| `*italic*`, `**bold**`, `[text](https://...)` | Italic, bold, and a link |
| `^[note text]` | A footnote |
| `[@key, p. 45]` | A cited source, in a footnote |
| `!> text` | A key point, set large |
| `>> text` | A margin note beside the next paragraph |
| `> text` | A block quotation |
| `- item`, `1. item` | Lists |
| `{Angle 1} text` | A row with a label in the margin, for angles, leads, and indicators |
| `[[name]]` | The chart, table, or image with that name |
| `---` | A new page |

Notes and citations also work on the Bottom line, Considerations, Debates, and Reference tabs, and in source annotations. Notes run in one sequence through the whole report.

### Sources

1. In the [OSINT Citation Generator](https://gmichaelrapp.github.io/OSINT_Cites/), save your source list to a file.
2. Under **Sources**, open that file. Each source gets a short key, such as `beckley-unrivaled`.
3. Click **Cite** to put `[@beckley-unrivaled]` where your cursor was, and add a page inside the brackets: `[@beckley-unrivaled, p. 45]`.

The first time a source is cited, its footnote is the full OSINT Style Guide citation; later citations are the short form.

For each source you can also set:

- a **grade**, such as B2: a letter for the source (A highly reliable to F unknown) and a number for the information (1 confirmed to 6 unknown). For a source from a list file, this is the grade in its citation.
- an **annotation**: what it is good for, and its slant.
- a **group**: Core sources, Supporting sources, Further reading, or Not listed.

The source assessment shows the counts, each group with its grades and annotations, and a short key to the grades. `[[rating-key]]` in an appendix adds the full rating key as a table.

### Visuals

These work exactly as in the White Paper Builder. Add a visual under **Visuals**, give it a name, and place it in the text with `[[name]]` on a line of its own. Column, bar, and line charts and tables take data pasted from a spreadsheet, typed with commas, or given as a Markdown table. Timelines take a date, a comma, and what happened; key numbers take a number, a comma, and what it measures.

### From the White Paper Builder

**Open project** also opens White Paper Builder projects. The title, subtitle, author, date, summary, findings, recommendations, body, visuals, appendix, and sources come across; your brand stays.

### Saving the PDF

1. Click **Print or save as PDF**.
2. In the print dialog, choose **Save as PDF**. Leave the paper size and margins at their defaults.
3. If the page color is missing, turn on **Background graphics**, or choose a white page under **Brand**.

Printing needs the page open in its own browser tab.

### Saving your work

The report is kept in this browser as you work. **Save project** saves a `.json` file with everything in it, images and brand included; **Open project** brings it back. Clearing your browser's site data clears the report in progress.

## Your data

The page runs entirely in your browser and makes no network requests. The fonts are built in, Cyrillic included, so the PDF looks the same on any computer.

## Known limits

- A table that runs onto a second page does not repeat its header row there.
- Printing is most faithful in Chrome and Edge.

## For maintainers

`index.html` is built from the files in `src/`:

- `src/core.js` turns a report into HTML: the parts, notes, citations, numbering, charts, and contents. It has no page and no browser code, so the tests run it directly. Its text, chart, and citation code comes from the White Paper Builder's core.
- `src/report.css` is the printed design. Paged.js reads it to lay out the pages.
- `src/ui.js` is the editor: tabs, toolbar, brand, visuals, sources, preview, files, and printing.
- `src/page.html` holds the editor's markup and styles.
- `src/vendor/` holds Paged.js, the OSINT Citation Generator core, and the IBM Plex fonts, unmodified.

After any change, rebuild and test:

```
python3 src/build.py
node Tests/run.js
```

Both need nothing beyond Python 3 and Node 18 or later. The tests also run on GitHub whenever a change is pushed.

## License

© 2026 G. Michael Rapp. MIT License; see `LICENSE`. The page includes Paged.js (MIT) and the IBM Plex fonts (SIL Open Font License 1.1). See `NOTICE.md`.
