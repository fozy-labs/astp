---
title: "Implementation: CLI MDA Manager"
date: 2026-03-22
status: Approved
feature: "Node.js CLI tool (astp) for managing MDA files — skills, agents, instructions"
plan: "../03-plan/README.md"
rdpi-version: b0.2
---

## Overview

Implements 5 plan phases for the `astp` CLI tool: project configuration + types, core layer (5 modules + tests), UI + commands + entry (6 modules + tests), templates + manifest (22 files + manifest.json), and documentation + E2E tests. Each plan phase maps to a coder→tester pair, with parallelization of Plan Phases 2 and 4.

## Phases

| Phase | Agent | Plan Phase | Depends on |
|-------|-------|------------|------------|
| 1.1 | `rdpi-codder` | Phase 1: Configuration + Types | — |
| 1.2 | `rdpi-tester` | Phase 1 verification | 1.1 |
| 2.1 | `rdpi-codder` | Phase 2: Core Layer | 1.2 |
| 4.1 | `rdpi-codder` | Phase 4: Templates + Manifest | 1.2 |
| 2.2 | `rdpi-tester` | Phase 2 verification | 2.1 |
| 4.2 | `rdpi-tester` | Phase 4 verification | 4.1 |
| 3.1 | `rdpi-codder` | Phase 3: UI + Commands + Entry | 2.2 |
| 3.2 | `rdpi-tester` | Phase 3 verification | 3.1 |
| 5.1 | `rdpi-codder` | Phase 5: Documentation + E2E | 3.2, 4.2 |
| 5.2 | `rdpi-tester` | Phase 5 verification | 5.1 |
| Final | `rdpi-implement-reviewer` | Implementation review | All |

## Next Steps

After all phases complete and review passes, the CLI is ready for build and publish.
