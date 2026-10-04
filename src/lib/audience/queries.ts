import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import { attributeSchema, type IcpAttribute } from "@/lib/audience/agent";
import type { AudienceKind, RecordSource } from "@/generated/prisma/enums";

/**
 * Audience reads.
 *
 * Json columns are parsed defensively on the way out: a row written by an older
 * shape degrades to an empty list rather than breaking the page.
 */

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function toAttributes(value: unknown): IcpAttribute[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => attributeSchema.safeParse(entry))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export interface PersonaRecord {
  id: string;
  name: string;
  role: string;
  snapshot: string;
  goals: string[];
  painPoints: string[];
  objections: string[];
  channels: string[];
  source: RecordSource;
}

export interface SegmentRecord {
  id: string;
  name: string;
  description: string;
  kind: AudienceKind;
  priority: number;
  painPoints: string[];
  motivations: string[];
  buyingTriggers: string[];
  objections: string[];
  preferredChannels: string[];
  messagingAngles: string[];
  source: RecordSource;
  evidenceNote: string | null;
  icp: {
    attributes: IcpAttribute[];
    qualifyingSignals: string[];
    disqualifiers: string[];
  } | null;
  personas: PersonaRecord[];
}

export async function listSegments(projectId: string): Promise<SegmentRecord[]> {
  await requireProject(projectId);

  const rows = await db.audienceSegment.findMany({
    where: { projectId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    include: { icp: true, personas: { orderBy: { createdAt: "asc" } } },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    priority: row.priority,
    painPoints: toStringList(row.painPoints),
    motivations: toStringList(row.motivations),
    buyingTriggers: toStringList(row.buyingTriggers),
    objections: toStringList(row.objections),
    preferredChannels: toStringList(row.preferredChannels),
    messagingAngles: toStringList(row.messagingAngles),
    source: row.source,
    evidenceNote: row.evidenceNote,
    icp: row.icp
      ? {
          attributes: toAttributes(row.icp.attributes),
          qualifyingSignals: toStringList(row.icp.qualifyingSignals),
          disqualifiers: toStringList(row.icp.disqualifiers),
        }
      : null,
    personas: row.personas.map((persona) => ({
      id: persona.id,
      name: persona.name,
      role: persona.role,
      snapshot: persona.snapshot,
      goals: toStringList(persona.goals),
      painPoints: toStringList(persona.painPoints),
      objections: toStringList(persona.objections),
      channels: toStringList(persona.channels),
      source: persona.source,
    })),
  }));
}

/**
 * Scoped through the project so an id from elsewhere cannot be opened.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */
export async function getSegment(projectId: string, segmentId: string) {
  await requireProject(projectId);

  const segments = await listSegments(projectId);
  return segments.find((segment) => segment.id === segmentId) ?? null;
}
