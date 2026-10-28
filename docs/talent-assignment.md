# AIX talent mapping and assignment

Open **Pemetaan & Penugasan** after estimating a project, or open it directly
to upload an existing validation workbook.

## Workflow

1. Load the current estimation result or upload a validation workbook containing
   `Capability`, `Breakdown_WBS`, and `Ringkasan`.
2. Upload `Talent Capability Breakdown.xlsx`. The first header groups skills by
   role; the second header identifies each skill. Every respondent is eligible
   for every project role. Primary and preferred roles are informational only.
3. Review each talent's current workload and capacity. You can add a
   `FTE` or `Current FTE` column to the talent workbook (including column E),
   with its label in either header row and values from row 3. Both labels mean
   current workload; they do not mean total capacity. `Capacity FTE` is also supported. Without
   current workload, availability remains unknown. Capacity defaults to 1 FTE.
   Numeric Excel cells work regardless of comma/dot display settings. Text
   values such as `0,5`, `0.5`, and `50%` are accepted. An FTE formula must have
   a calculated result saved in the workbook; the app reports uncached formulas
   and their cell addresses instead of guessing a workload. The upload summary
   identifies the FTE column and the number of successfully loaded values.
4. Review project demand, WBS classification, skill weights, and target levels.
   You can add catalog skills or remove requirements. The default target is 3.
   Requested demand defaults to `Ringkasan` → `Diminta (FTE)` (column C), or 0
   when absent. The current estimator run uses its requested role inputs.
   UCP/Bottom-up peak/average estimates remain separate comparison values.
   The chosen method controls the estimate column without overwriting requests.
   Edit requested FTE per role to set the final combination. The summary shows
   requested, estimated, selected talent count, allocated, and remaining FTE.
   `Engineer` in older rosters and sessions is displayed as `AI Engineer`.
5. Compare all candidates and open their skill details. Select any talent,
   change their assigned FTE, or replace them with another candidate.
6. Download the assignment workbook, including the full ranking, human choices,
   per-skill calculations, requirements, and outstanding capacity warnings.
   Save the planning session as JSON to resume it after leaving the page.

Talent data and assignments stay in browser memory between requests and are
processed in server memory. They are not committed to GitHub, bundled in the
public deployment, stored in a database, or sent to the LLM for ranking. Saved
session files contain personal talent data; keep them in your own workspace.
The public app starts empty. Closing or navigating away from the planning page
discards unsaved planning inputs.

## Scoring policy

The initial policy has three transparent components:

| Component | Maximum | Calculation |
| --- | ---: | --- |
| Proficiency | 70 | Weighted average of `(level - 1) / 4` |
| Target coverage | 20 | Weighted share of required skills where level meets the target |
| Capacity | 10 | `min(available FTE / remaining assignment slot, 1)` |

The total is 0–100. Skill levels mean: 1 no experience, 2 basic, 3 intermediate,
4 proficient, and 5 expert. Level 1 earns zero proficiency points. Missing
proficiency also earns zero skill and coverage points and appears explicitly
as unavailable in the detail view; it is never dropped from the denominator.

Each requirement's starting weight is its WBS effective UCP weight: Simple 5,
Average 10, Complex 15, multiplied by quantity and the supporting-role factor
where applicable. When a skill appears on several WBS items, its weights add;
the highest requested target applies. Reviewers can change individual weights
and targets. Exact duplicate item/role/pillar/skill requirements are rejected.

Available FTE is `max(0, capacity - current workload - all proposed allocations)`.
The remaining assignment slot is the remaining demand for that role, capped
at the candidate's capacity. Unknown current FTE or unknown role demand earns
zero capacity points and a provisional label. When no demand remains, capacity
adds zero points. Scores refresh when assignments or workload change. This is
a ranking for the remaining need, not a frozen pre-allocation score.

Current workload must refer to the same period as the proposed project.
Allocations are conservatively concurrent and additive across roles. The app
does not infer monthly workload or assume that two assignments do not overlap.
Over-capacity and unknown-workload plans retain their warnings. A role's
missing-selection alert appears only when requested FTE is positive and no
talent is selected. Selecting a talent removes that alert; the summary still
shows any remaining FTE. Roles with zero demand produce no role warnings.
Choosing a talent does not constitute an approved assignment.

The 70/20/10 weights are an initial planning policy, not a validated measure of
job performance. Calibrate them against reviewed project outcomes. A human can
choose a lower-ranked talent after considering skill gaps and context.

## Catalog compatibility

The default catalog includes all 127 data-role skills and English definitions
from the supplied capability sheet. The upstream design-role scope and skills
remain available. Katalog Capability accepts either:

- The system format: `Scope_Capability`, `Pilar_Skill`, and optional
  `Skill_Definitions` sheets.
- The flat format: `Role`, `Category`, `Skill`, `Definition` columns.

The catalog download is compatible with the system format and includes the
definition sheet. Talent skill matching uses role group, pillar, and skill,
with case and punctuation normalization. Identical names in different role
groups remain distinct self-assessment answers. Unrecognized columns are
reported rather than guessed. A blank score filled with 1 in the supplied
workbook is treated as level 1, as requested in the catalog preparation.

## Import rules

Validation workbook import reads UCP classification and cached effective
weights from `Breakdown_WBS`, and maps the rows of `Capability` to them.
Bottom-up peak FTE comes from the first `Ringkasan` role table. Uncached FTE
formulas are left unknown and must be entered by the reviewer. A live estimator
run also supports UCP peak, UCP average, and bottom-up average demand.

The supplied survey's duplicate storage label was confirmed as
`Data Warehouse / OLAP Architecture`, and the monitoring deployment label was
confirmed as `Data Lineage Tracking` during preparation of the talent workbook.
The app consumes the corrected talent workbook and does not infer additional
survey-label corrections.
