export interface RepoSummary {
  id: string;
  name: string;
  source: { type: "zip" | "url"; url?: string };
  status: "loading" | "ready" | "error";
  phase?: string;
  error?: string;
  head?: string;
  commitCount?: number;
  createdAt: number;
}

export interface Metrics {
  commitCount: number;
  added: number;
  removed: number;
  growth: number;
  churn: number;
  modifications: number;
  modificationFrequency: number;
  churnRate: number;
}

export interface GroupedAuthor {
  id: string;
  name: string;
  keys: string[];
  modifications: number;
  churn: number;
  ownership: number;
}

export interface ChildRow extends Metrics {
  name: string;
  path: string;
  type: "dir" | "file";
}

export interface MetricsResponse {
  path: string;
  kind: "file" | "dir";
  metrics: Metrics;
  authors: GroupedAuthor[];
  children?: ChildRow[];
}

export interface AuthorRow {
  key: string;
  name: string;
  email: string;
  commits: number;
}

export interface AuthorGroup {
  id: string;
  name: string;
  keys: string[];
}

export interface MailmapSuggestion {
  key: string;
  mergedKey: string;
  mergedName: string;
  mergedEmail: string;
}

export interface AuthorsResponse {
  authors: AuthorRow[];
  groups: AuthorGroup[];
  mailmap: string | null;
  suggestions: MailmapSuggestion[];
}

export interface CommitRow {
  hash: string;
  date: number;
  author: string;
  rawAuthor: string;
  subject: string;
}

export interface FiltersState {
  author: string | null;
  since?: number;
  until?: number;
  commits: string[] | null;
}
