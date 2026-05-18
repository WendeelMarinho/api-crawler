export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface EndpointParam {
  name: string;
  type?: string;
  required: boolean;
  description?: string;
  default?: string;
  in: 'path' | 'query' | 'header' | 'body' | 'cookie';
}

export interface EndpointExample {
  language: string;
  code: string;
  label?: string;
  /** ReadMe Try It tab label when captured via tab cycling */
  sourceTab?: string;
  /** First 16 hex chars of sha256(UTF-8 code) for dedupe / debug */
  snippetHash?: string;
  /** Classification aligned with `CodeBlock.exampleType` */
  exampleType?: 'schema' | 'request' | 'response' | 'snippet' | 'try-it';
}

export interface EndpointResponse {
  statusCode: string;
  description?: string;
  schema?: Record<string, unknown>;
  example?: string;
}

export interface EndpointDefinition {
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  headers: EndpointParam[];
  queryParams: EndpointParam[];
  pathParams: EndpointParam[];
  bodyParams: EndpointParam[];
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  responses: EndpointResponse[];
  authRequired: boolean;
  examples: EndpointExample[];
  tags: string[];
}
