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

/** A creator account (a person, duo or brand) and its Hark creator ID. */
export interface CreatorRecord {
  /** Hark creator ID, e.g. CT0042. Stays the same across platforms and link types. */
  id: string;
  name: string;
  /** Handle per platform, lowercase without the @: { instagram: 'oliviazhangofficial', tiktok: 'livviazhang' }. */
  handles: Record<string, string>;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewCreator {
  name: string;
  handles: Record<string, string>;
  /** An ID Hark already issued. Without one, the next free CT number is assigned. */
  id?: string;
}

export interface CreatorsResponse {
  storage: 'database' | 'none';
  creators: CreatorRecord[];
}

export interface SaveCreatorsRequest {
  creators: NewCreator[];
  createdBy?: string;
}

export interface SaveCreatorsResponse {
  /** One per requested creator, in the same order: the matched or newly created record. */
  creators: CreatorRecord[];
  /** IDs created by this request. */
  created: string[];
}

export interface UpdateCreatorRequest {
  id: string;
  patch: Partial<Pick<CreatorRecord, 'name' | 'handles' | 'notes'>> & { id?: string };
}
