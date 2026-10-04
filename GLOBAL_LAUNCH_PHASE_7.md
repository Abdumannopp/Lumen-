# Lumen — Global Launch Phase 7

## Objective

Measure whether Lumen itself creates repeatable customer value, with a founder-only product analytics surface that distinguishes activation, meaningful usage, and retention.

## Shipped

### Privacy-minimal product telemetry

Added a dedicated `ProductEvent` table and a best-effort server-side event writer. The system records meaningful product actions only. Page views, keystrokes, raw business text, credentials, and email addresses are not part of product telemetry. Analytics write failures never block a customer action.

### Activation funnel

Founder analytics now show workspace-level conversion across:

1. Project created
2. Onboarding completed
3. Growth run generated
4. Weekly plan generated
5. Task completed
6. Outcome recorded
7. Paid subscription active

The denominator is workspaces, not projects, so a customer with several businesses cannot inflate the funnel.

### Activation speed

The product-health surface reports activation rate and median days from onboarding completion to first weekly plan.

### Retention cohorts

Weekly cohorts are based on onboarding completion. W1, W2, and W4 retention require at least one meaningful core action during that corresponding 7-day window. Cohorts are marked ineligible for a window until enough time has actually elapsed, avoiding false churn for recent users.

### Instrumented actions

Project creation, onboarding completion, Google connection/sync, manual metric entry, recommendation generation, weekly plan generation, task completion/skip/outcome, experiment creation/completion, paid subscription activation, and feedback submission are tracked.

## Product principle

The key loop is:

**Activated workspace → first plan → first completed action → recorded outcome → repeated weekly use.**

Retention is the guardrail: feature volume without movement in this loop is not product progress.

## Important limitations

- Workspaces created before Phase 7 have no historical product-event stream, so early cohorts may understate their prior activation/retention.
- Retention here is behavioural product usage, not revenue retention.
- A product event proves an action happened; it does not prove causal business impact. The Outcome / Experiment loop from Phase 6 remains the evidence layer for business results.

## Next stage

Phase 8 should harden global production operations: security review, observability, background-job recovery, and end-to-end tests across the critical customer journey.
