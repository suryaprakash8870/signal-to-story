# 08 - Test Fixtures and Testing Strategy

## Fixture files (ship these alongside the code, e.g. `/fixtures/`)

| File | Confidence | Use |
|---|---|---|
| `gong_sample.json` | High - follows Gong's public Calls + Transcript API pattern | Test the pipeline against a Gong-shaped signal |
| `salesforce_sample.json` | Low - explicitly illustrative, see `_fixture_note` in the file | Test the pipeline against a Salesforce-shaped signal; includes a `config_mapping_example` showing the adapter should read field names from `connectors.config`, not hardcode them |
| `crayon_sample.json` | High - follows Crayon's public Alerts API pattern | Test the pipeline against a Crayon-shaped signal |
| `expected_pipeline_output_example.json` | Reference target | What Stages 2, 3, and 5 should produce from any of the three fixtures above - all three represent the same underlying signal, so this is one shared test target regardless of source |

Before wiring any real connector to Live mode: confirm the Salesforce
object/field names with Litera's Salesforce admin, and spot-check the
Gong and Crayon shapes against Litera's actual API responses once access
is available. These fixtures are a starting point for building and
testing, not a substitute for that confirmation.

## Test sequence (do these in order - matches `00-OVERVIEW.md` build order)

1. **Plumbing test (Ollama).** Feed `gong_sample.json` through Stages 2→5
   end to end. Confirm: valid JSON at every stage, correct writes to
   `signal_classification` and `signal_outputs`, signal status transitions
   correctly, review queue shows it, approval is blocked until any
   `unverified_claims` are resolved.

2. **Grounding test (Claude API - do not skip this).** Re-run the same
   fixture with `LLM_PROVIDER=claude`. Then run a second fixture
   deliberately worded to contain an inference beyond what's stated (e.g.
   add "this means Competitor X has fundamentally better AI" to the raw
   signal, which is a stronger claim than the source material supports)
   and confirm `unverified_claims` actually populates. If it doesn't, the
   grounding prompt in `02-PIPELINE-STAGES.md` needs tightening before
   this goes anywhere near real output - this is the check that matters
   most in the whole test suite.

3. **Connector test (Test Mode).** Confirm `salesforce_sample.json` and
   `crayon_sample.json` flow through their respective connector adapters
   in `mode: 'test'` and produce the same classification/interpretation
   quality as the Gong fixture - all three represent the same underlying
   story specifically so this comparison is possible.

4. **Distribution test.** Approve an output, confirm it posts to Teams.
   Then confirm the Gmail digest batches correctly according to
   `connectors.cadence`.

## What each fixture does NOT test

Real-world messiness - actual Gong transcripts have filler words and
imperfect formatting, actual Salesforce notes may contain rich text/HTML,
actual Crayon alerts sometimes reference broken or paywalled links. If
real (redacted) exports become available from Litera, add them as
additional fixtures rather than replacing the synthetic ones - the
synthetic ones remain useful as clean baseline tests even after real
examples are added.
