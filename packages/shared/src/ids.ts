/**
 * ID + timestamp helpers shared across packages.
 *
 * IDs are server-generated UUIDs; timestamps are ISO-8601 strings validated as
 * "parseable", not via a zod-version-specific datetime helper, so the schema stays
 * portable across zod minor versions. Loose parsing (Date.parse) is intentional.
 */
import { z } from "zod";
import { randomUUID } from "node:crypto";

export const newId = (): string => randomUUID();

export const isoString = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "invalid ISO-8601 timestamp",
  });
