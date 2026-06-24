---
title: Auto-Generated — Do Not Edit
sidebar:
  hidden: true
---

# DO NOT EDIT THIS DIRECTORY

The files in this directory are **auto-generated** from the F-01 Zod environment schema.

**Source:** `src/_generated/env-schema.json` (fetched from `irongate-server`)
**Generator:** `irongate-docs/scripts/generate-env-docs.ts`
**Contract:** Every `IRONGATE_*` variable must have a `.describe()` annotation in the format:
`"description | required|optional | default:X | group:Y"`

To add or update a configuration variable, edit the Zod schema in
`irongate-server/apps/server/src/plugins/env.ts` and push to main.
