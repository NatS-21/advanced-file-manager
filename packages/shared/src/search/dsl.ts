export type LogicalOp = 'AND' | 'OR';

export type FilterOp =
  | 'eq'
  | 'in'
  | 'range'
  | 'exists'
  | 'containsAll'
  | 'containsAny'
  | 'fuzzy'
  | 'prefix';

export interface BaseFilter {
  field: string;
  op: FilterOp;
  value?: unknown;
}

export interface FilterGroup {
  logic: LogicalOp;
  filters: Array<BaseFilter | FilterGroup>;
}

export type Filter = BaseFilter | FilterGroup;

export interface SortSpec {
  field: 'relevance' | string;
  dir: 'asc' | 'desc';
}

export interface FacetSpec {
  field: string;
  limit?: number;
}

export interface SearchRequest {
  q?: string;
  filters?: Filter[];
  sort?: SortSpec[];
  page?: number;
  perPage?: number;
  facets?: FacetSpec[];
}

export interface SearchResultItem {
  id: number;
  fileId?: number | null;
  folderId?: number | null;
  type: 'image' | 'video' | 'audio' | 'doc';
  title: string | null;
  description: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
  capturedAt: string | null;
  previewUrl?: string;
  relevance?: number;
}

export interface FacetBucket { value: string; count: number; }
export type FacetsResponse = Record<string, FacetBucket[]>;

export interface SearchResponse {
  items: SearchResultItem[];
  total: number;
  page: number;
  perPage: number;
  facets?: FacetsResponse;
}




