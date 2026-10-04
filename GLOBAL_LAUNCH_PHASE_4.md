# Lumen — Global Launch Phase 4

## Objective

Turn analytics into a decision loop: Lumen should not only show metrics, but identify meaningful changes and convert them into concrete next moves.

## Shipped

- Added deterministic growth signals based only on the project's own recorded data.
- Added two comparable 14-day windows for trend detection.
- Added a Growth Pulse UI on the Growth page.
- Added recent-vs-previous performance and growth signals to the AI context.
- Signals use explicit thresholds and never invent external benchmarks.
- Signals distinguish missing data from zero values.

## Signal priorities

1. Revenue / return on spend
2. Customer movement
3. Conversion efficiency
4. Lead volume
5. Traffic movement
6. Material channel changes

## Product loop

Google / manual data → comparable periods → deterministic signal → ASCEND context → recommendation → CADENCE weekly task → result → future learning.

## Verification note

The repository contains the implementation and static checks can run without network access. A full production build still requires a complete dependency install in the target environment.
