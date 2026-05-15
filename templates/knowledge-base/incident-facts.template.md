---
title: Facts from YYYY-MM-DD <incident-slug>
tier: incident-facts
domains:
  - incidents
status: active                # active | archived
last_updated: YYYY-MM-DD
incident_id: YYYY-MM-DD-<kebab-slug>   # MUST match the parent folder name AND the sibling narrative.md's id
produced:                              # REQUIRED — array, may be EMPTY if the incident produced no new facts
  - <fact-id-1>
  - <fact-id-2>
strengthened:                          # OPTIONAL — facts whose confidence increased because of this incident
  - <fact-id-a>
weakened:                              # OPTIONAL — facts whose confidence decreased
  - <fact-id-b>
---

# Facts from YYYY-MM-DD <incident-slug>

## Produced
<One line per produced fact, with a short justification tying it to the incident evidence.>
- `<fact-id-1>` — <one-sentence justification: what during the incident proved this fact>
- `<fact-id-2>` — <one-sentence justification>

## Strengthened
<For each strengthened fact, one line on what new evidence raised confidence.>
- `<fact-id-a>` — <reason confidence increased>

## Weakened
<For each weakened fact, one line on what evidence contradicts it.>
- `<fact-id-b>` — <reason confidence decreased>
