"""
Run with:  python seed.py
Populates the DB with realistic sample data for local testing.
Does NOT call the Anthropic API — outputs use placeholder HTML.
"""
import json
from app.database import init_db, get_db

init_db()
db = get_db()

# Wipe existing seed data so this is re-runnable
db.executescript("""
    DELETE FROM grades;
    DELETE FROM submissions;
    DELETE FROM students;
    DELETE FROM outputs;
    DELETE FROM workflows;
    DELETE FROM curriculum_docs;
    DELETE FROM context_notes;
    DELETE FROM suggestions;
""")
db.commit()

# ── Context notes ──────────────────────────────────────────────────────────────
notes = [
    ("English 1 Overview", "class",
     "28 students. Mixed reading levels — roughly 1/3 below grade level. Strong class discussion culture. "
     "Currently in the Short Story unit (weeks 4–6). Common struggle: identifying figurative language in context."),
    ("English 2 Overview", "class",
     "24 students. Generally stronger independent readers than E1. Working on argumentative writing. "
     "Several ELL students — simplify vocabulary in instructions where possible."),
    ("Teaching Preferences", "preference",
     "I prefer worksheets to have a clear example before the student practice section. "
     "Font size 12+ for readability. Always include a word bank for vocabulary activities. "
     "Avoid multiple-choice — I prefer short answer and written response."),
    ("Accommodations", "students",
     "3 students with IEPs requiring extended time and reduced-distraction testing. "
     "2 students need large-print versions (font size 16+). Flag any timed activities."),
]
for title, category, content in notes:
    db.execute(
        "INSERT INTO context_notes (title, content, category, active) VALUES (?, ?, ?, 1)",
        (title, category, content)
    )

# ── Curriculum docs ────────────────────────────────────────────────────────────
docs = [
    ("short_story_unit_guide.txt", "Short Story Unit Guide", "Literature", "english1",
     "Unit 2: Short Story. Standards: RL.9-10.1 (cite textual evidence), RL.9-10.4 (word meaning/tone). "
     "Key texts: 'The Lottery' by Shirley Jackson, 'The Most Dangerous Game' by Richard Connell. "
     "Essential question: How do authors use narrative elements to build suspense?"),
    ("textual_evidence_notes.txt", "Textual Evidence Lesson Notes", "Writing", "both",
     "Textual evidence: quoting directly from the text to support an argument or analysis. "
     "Format: Lead-in + Quote (Author Last, pg#) + Explanation (the 'so what'). "
     "Common errors: floating quotes, over-quoting, not explaining the connection to the claim."),
    ("argumentative_writing_rubric_guide.txt", "Argumentative Writing Guide", "Writing", "english2",
     "Argument structure: Claim → Reasons → Evidence → Counterclaim → Rebuttal → Conclusion. "
     "Toulmin model: Grounds (evidence), Warrant (reasoning), Backing (support for warrant). "
     "AP-level expectation for E2: students should embed counterarguments naturally, not as a separate paragraph."),
]
doc_ids = {}
for filename, title, subject, grade, content in docs:
    filepath = f"curriculum/{filename}"
    with open(filepath, "w") as f:
        f.write(content)
    cur = db.execute(
        "INSERT INTO curriculum_docs (filename, filepath, title, subject, grade) VALUES (?, ?, ?, ?, ?)",
        (filename, filepath, title, subject, grade)
    )
    doc_ids[filename] = cur.lastrowid

# ── Workflows ──────────────────────────────────────────────────────────────────
SAMPLE_HTML = lambda title, grade, body: f"""<!DOCTYPE html>
<html><head><title>{title}</title>
<style>
  body {{ font-family: Arial, sans-serif; font-size: 12pt; max-width: 7.5in; margin: 1in auto; color: #1a1a1a; }}
  h1 {{ font-size: 16pt; border-bottom: 2px solid #333; padding-bottom: 6px; }}
  h2 {{ font-size: 13pt; margin-top: 20px; }}
  .header-info {{ display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 11pt; }}
  .answer-line {{ border-bottom: 1px solid #666; min-height: 24px; margin: 8px 0 16px; }}
  @media print {{ body {{ margin: 0.75in; }} }}
</style>
</head><body>
<h1>{title}</h1>
<div class="header-info">
  <span>Name: <span style="border-bottom:1px solid #333;display:inline-block;width:200px">&nbsp;</span></span>
  <span>Class: {grade}</span>
  <span>Date: <span style="border-bottom:1px solid #333;display:inline-block;width:100px">&nbsp;</span></span>
</div>
{body}
</body></html>"""

workflows_data = [
    {
        "name": "Textual Evidence Worksheet — English 1",
        "type": "worksheet",
        "grade": "english1",
        "context": "Students need practice with the Lead-in → Quote → Explanation format for RL.9-10.1. "
                   "Focus on 'The Lottery' by Shirley Jackson.",
        "doc_ids": [doc_ids["short_story_unit_guide.txt"], doc_ids["textual_evidence_notes.txt"]],
        "rubric": """Textual Evidence Worksheet Rubric — English 1 (9th Grade) — 100 points

1. Claim / Topic Sentence (20 pts)
   Full (20): Clear, specific claim directly responds to the prompt
   Partial (10): Claim present but vague, generic, or partially off-topic
   None (0): No identifiable claim or just restates the question

2. Textual Evidence — Quote Selection (25 pts)
   Full (25): 2 well-chosen quotes that clearly support the claim; correctly formatted with attribution
   Partial (13): 1 quote, or quotes present but weakly connected or missing attribution
   None (0): No quoted evidence from the text

3. Explanation / Analysis (35 pts)
   Full (35): Each quote is followed by a clear explanation of HOW it supports the claim (the "so what")
   Partial (18): Explanation present but mostly summarizes rather than analyzes
   None (0): No explanation provided; quote is left floating

4. Conventions (20 pts)
   Full (20): Few or no errors in grammar, spelling, punctuation; sentences are complete
   Partial (10): Several errors but meaning is clear
   None (0): Errors significantly impede understanding

Total: 100 points""",
        "html": SAMPLE_HTML(
            "Textual Evidence Worksheet", "English 1 — 9th Grade",
            """<h2>Directions</h2>
<p>Use the format below to practice supporting a claim with textual evidence from <em>The Lottery</em> by Shirley Jackson.
Remember: Lead-in → Quote → Explanation ("so what").</p>

<h2>Example</h2>
<p><strong>Claim:</strong> Jackson uses setting details to create a false sense of normalcy.</p>
<p><strong>Evidence:</strong> Jackson writes, "The morning of June 27th was clear and sunny, with the fresh warmth of a full-summer day" (Jackson, 1).</p>
<p><strong>Explanation:</strong> This cheerful description lulls the reader into a sense of safety, making the violent ending more shocking by contrast.</p>

<h2>Your Turn</h2>
<p><strong>Prompt:</strong> How does Jackson use foreshadowing to hint at the story's violent ending?</p>
<p><strong>Your Claim:</strong></p>
<div class="answer-line"></div>

<p><strong>Evidence #1</strong> (Lead-in + Quote + Page #):</p>
<div class="answer-line"></div><div class="answer-line"></div>
<p><strong>Explanation:</strong></p>
<div class="answer-line"></div><div class="answer-line"></div>

<p><strong>Evidence #2</strong> (Lead-in + Quote + Page #):</p>
<div class="answer-line"></div><div class="answer-line"></div>
<p><strong>Explanation:</strong></p>
<div class="answer-line"></div><div class="answer-line"></div>"""
        ),
    },
    {
        "name": "Textual Evidence Worksheet — English 2",
        "type": "worksheet",
        "grade": "english2",
        "context": "Similar textual evidence practice but English 2 students should also address a counterclaim "
                   "and their quotes should integrate smoothly into their own sentences.",
        "doc_ids": [doc_ids["textual_evidence_notes.txt"], doc_ids["argumentative_writing_rubric_guide.txt"]],
        "rubric": """Textual Evidence Worksheet Rubric — English 2 (10th Grade) — 100 points

1. Arguable Claim (20 pts)
   Full (20): Sophisticated, specific claim that takes a clear position; goes beyond obvious observations
   Partial (10): Claim present but could be stronger or more specific
   None (0): Missing or purely factual statement (not arguable)

2. Evidence Integration (30 pts)
   Full (30): 2+ quotes smoothly embedded into student's own sentences (not "floating"); correctly cited
   Partial (15): Quotes present but dropped in without integration, or only 1 quote
   None (0): No evidence, or evidence is entirely paraphrased without quotation

3. Analysis & Reasoning (30 pts)
   Full (30): Analysis explains the logical connection between evidence and claim; shows insight beyond surface meaning
   Partial (15): Analysis present but stays at summary level
   None (0): No analysis; student does not explain the significance

4. Counterclaim Acknowledgment (10 pts)
   Full (10): Briefly acknowledges an opposing view and explains why the claim still holds
   Partial (5): Counterclaim mentioned but not addressed
   None (0): No counterclaim

5. Conventions (10 pts)
   Full (10): Clean writing; no significant errors
   Partial (5): A few errors; generally readable
   None (0): Errors impede meaning

Total: 100 points""",
        "html": SAMPLE_HTML(
            "Textual Evidence & Argument Worksheet", "English 2 — 10th Grade",
            """<h2>Directions</h2>
<p>Construct a short argument using embedded textual evidence. Your quotes should flow naturally
into your own sentences. Include a counterclaim in your final paragraph.</p>

<h2>Part 1: Your Argument</h2>
<p><strong>Topic:</strong> How does the author use _________________ to develop a central theme?</p>
<p><strong>Claim:</strong></p>
<div class="answer-line"></div><div class="answer-line"></div>

<p><strong>Body Paragraph</strong> (embed at least 2 quotes; explain each):</p>
<div class="answer-line"></div><div class="answer-line"></div>
<div class="answer-line"></div><div class="answer-line"></div>
<div class="answer-line"></div><div class="answer-line"></div>

<h2>Part 2: Counterclaim</h2>
<p>Some might argue that _________________. However, _________________ because _________________.</p>
<div class="answer-line"></div><div class="answer-line"></div>"""
        ),
    },
    {
        "name": "Short Story Vocab Foldable — The Lottery",
        "type": "foldable",
        "grade": "english1",
        "context": "Vocabulary foldable for key literary terms in The Lottery unit.",
        "doc_ids": [doc_ids["short_story_unit_guide.txt"]],
        "rubric": None,
        "html": SAMPLE_HTML(
            "The Lottery — Literary Terms Foldable", "English 1",
            """<style>
  .panels {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }}
  .panel {{ border: 2px solid #333; padding: 14px; min-height: 180px; }}
  .panel h3 {{ margin: 0 0 8px; font-size: 12pt; border-bottom: 1px solid #ccc; padding-bottom: 4px; }}
  .term {{ font-weight: bold; font-style: italic; }}
  .def-line {{ border-bottom: 1px solid #aaa; min-height: 20px; margin: 6px 0; }}
</style>
<p><em>Cut along the dotted lines and fold in half to create your foldable study guide.</em></p>
<div class="panels">
  <div class="panel"><h3>Foreshadowing</h3>
    <p class="term">Definition:</p><div class="def-line"></div><div class="def-line"></div>
    <p class="term">Example from text:</p><div class="def-line"></div><div class="def-line"></div></div>
  <div class="panel"><h3>Irony</h3>
    <p class="term">Definition:</p><div class="def-line"></div><div class="def-line"></div>
    <p class="term">Example from text:</p><div class="def-line"></div><div class="def-line"></div></div>
  <div class="panel"><h3>Symbolism</h3>
    <p class="term">Definition:</p><div class="def-line"></div><div class="def-line"></div>
    <p class="term">Example from text:</p><div class="def-line"></div><div class="def-line"></div></div>
  <div class="panel"><h3>Theme</h3>
    <p class="term">Definition:</p><div class="def-line"></div><div class="def-line"></div>
    <p class="term">My theme statement:</p><div class="def-line"></div><div class="def-line"></div></div>
</div>"""
        ),
    },
]

for wf in workflows_data:
    cur = db.execute(
        "INSERT INTO workflows (name, type, grade, context, doc_ids, rubric) VALUES (?, ?, ?, ?, ?, ?)",
        (wf["name"], wf["type"], wf["grade"], wf.get("context"),
         json.dumps(wf["doc_ids"]), wf.get("rubric"))
    )
    wf_id = cur.lastrowid
    db.execute(
        "INSERT INTO outputs (workflow_id, version, html) VALUES (?, 1, ?)",
        (wf_id, wf["html"])
    )
    db.execute("UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (wf_id,))

# ── Students ───────────────────────────────────────────────────────────────────
english1_students = [
    "Aaliyah Thompson", "Brandon Cruz", "Cameron Lee", "Destiny Ramirez",
    "Ethan Nguyen", "Fatima Hassan", "Gabriel Morales", "Hannah Kim",
    "Isaiah Williams", "Jasmine Patel",
]
english2_students = [
    "Kayla Robinson", "Liam Okonkwo", "Maya Hernandez", "Noah Davis",
    "Olivia Chen", "Pedro Santos", "Quinn Murphy", "Riley Johnson",
    "Sofia Andersen", "Theo Washington",
]
for name in english1_students:
    db.execute("INSERT INTO students (name, grade) VALUES (?, 'english1')", (name,))
for name in english2_students:
    db.execute("INSERT INTO students (name, grade) VALUES (?, 'english2')", (name,))

# ── Suggestions ────────────────────────────────────────────────────────────────
db.execute(
    "INSERT INTO suggestions (title, description, status) VALUES (?, ?, ?)",
    ("Export grades to Google Sheets",
     "Would be great if I could push the gradebook directly to a Google Sheet instead of importing CSV.",
     "new")
)
db.execute(
    "INSERT INTO suggestions (title, description, status) VALUES (?, ?, ?)",
    ("Parent-friendly feedback letter",
     "After grading, generate a short parent-readable summary of how their student did and what to work on.",
     "new")
)

db.commit()
db.close()

print("Seeded:")
print(f"  {len(notes)} context notes")
print(f"  {len(docs)} curriculum docs (files written to curriculum/)")
print(f"  {len(workflows_data)} workflows with outputs")
print(f"  {len(english1_students)} English 1 students")
print(f"  {len(english2_students)} English 2 students")
print("  2 suggestions")
print("\nRun 'make run' to start the app.")
