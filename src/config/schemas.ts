import { z } from 'zod';

export const httpMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

export const endpointParamSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  required: z.boolean(),
  description: z.string().optional(),
  default: z.string().optional(),
  in: z.enum(['path', 'query', 'header', 'body', 'cookie']),
});

export const endpointDefinitionSchema = z.object({
  method: httpMethodSchema,
  path: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  headers: z.array(endpointParamSchema),
  queryParams: z.array(endpointParamSchema),
  pathParams: z.array(endpointParamSchema),
  bodyParams: z.array(endpointParamSchema),
  request: z.record(z.unknown()).optional(),
  response: z.record(z.unknown()).optional(),
  responses: z.array(
    z.object({
      statusCode: z.string(),
      description: z.string().optional(),
      schema: z.record(z.unknown()).optional(),
      example: z.string().optional(),
    }),
  ),
  authRequired: z.boolean(),
  examples: z.array(
    z.object({
      language: z.string(),
      code: z.string(),
      label: z.string().optional(),
    }),
  ),
  tags: z.array(z.string()),
});

export const semanticChunkSchema = z.object({
  id: z.string(),
  domain: z.string(),
  section: z.string(),
  type: z.string(),
  embedding_hint: z.string(),
  content: z.string().min(1),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])),
  sourceUrl: z.string().url(),
  documentId: z.string(),
});

export const semanticDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: z.string(),
  subcategory: z.string(),
  type: z.string(),
  url: z.string().url(),
  content: z.string(),
  markdown: z.string(),
  description: z.string().optional(),
  headings: z.array(
    z.object({
      level: z.number(),
      text: z.string(),
      id: z.string().optional(),
    }),
  ),
  tables: z.array(
    z.object({
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string())),
      caption: z.string().optional(),
    }),
  ),
  examples: z.array(
    z.object({
      language: z.string(),
      code: z.string(),
      label: z.string().optional(),
    }),
  ),
  codeBlocks: z.array(
    z.object({
      language: z.string(),
      code: z.string(),
      label: z.string().optional(),
    }),
  ),
  breadcrumbs: z.array(z.string()),
  tags: z.array(z.string()),
  endpoint: endpointDefinitionSchema.optional(),
  version: z.string().optional(),
  authRequired: z.boolean().optional(),
  contentHash: z.string(),
  extractedAt: z.string(),
  framework: z.string().optional(),
  storageSegments: z.array(z.string()).optional(),
  extractionQuality: z.enum(['complete', 'partial', 'failed']).optional(),
});

export const sessionMetadataSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
  baseUrl: z.string().url(),
  valid: z.boolean(),
});

export const storedSessionSchema = z.object({
  metadata: sessionMetadataSchema,
  storageState: z.record(z.unknown()),
});

export function validateSemanticDocument(data: unknown) {
  return semanticDocumentSchema.safeParse(data);
}

export function validateSemanticChunk(data: unknown) {
  return semanticChunkSchema.safeParse(data);
}
