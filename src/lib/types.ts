import type { Params } from '../config/params';

/** A link in the shared library. Shared by the browser and the API. */
export interface LinkRecord {
  id: string;
  /** Insertion order: links saved together keep the order they were pasted in. */
  seq: number;
  /** The full tagged URL. Unique: building the same link twice returns the saved one. */
  url: string;
  baseUrl: string;
  params: Params;
  channel: string;
  label: string;
  batchId: string | null;
  batchName: string | null;
  notes: string;
  status: 'active' | 'archived';
  createdBy: string;
  team: string;
  createdAt: string;
  updatedAt: string;
}

export type NewLink = Pick<LinkRecord, 'url' | 'baseUrl' | 'params' | 'channel' | 'label' | 'notes' | 'createdBy' | 'team'>;

export interface LibraryResponse {
  /** 'none' until a Postgres database is connected in Vercel. */
  storage: 'database' | 'none';
  links: LinkRecord[];
}

export interface SaveRequest {
  links: NewLink[];
  /** Saving several links at once groups them as a batch. */
  batchName?: string;
}

export interface SaveResponse {
  created: LinkRecord[];
  /** Links that were already in the library (archived ones are restored). */
  existing: LinkRecord[];
}

export interface UpdateRequest {
  ids: string[];
  patch: Partial<Pick<LinkRecord, 'status' | 'notes' | 'label'>>;
}

export interface DeleteRequest {
  ids: string[];
}
