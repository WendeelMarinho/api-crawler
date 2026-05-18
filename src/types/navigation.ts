export interface NavigationNode {
  title: string;
  slug: string;
  url?: string;
  depth: number;
  order: number;
  children: NavigationNode[];
}

export interface NavigationTree {
  [domainSlug: string]: NavigationBranch;
}

export interface NavigationBranch {
  title: string;
  slug: string;
  url?: string;
  children: NavigationNode[];
}

export interface FlatNavItem {
  title: string;
  slug: string;
  url: string;
  domain: string;
  depth: number;
  order: number;
  parentSlug?: string;
  /** Slug path from domain root to this page, e.g. ["v1-banking","pix-indirect","register-key"] */
  navPath?: string[];
  /** Human titles matching navPath (for breadcrumbs) */
  pathTitles?: string[];
}

export interface ArchitectureMap {
  [domainSlug: string]: ArchitectureDomain;
}

export interface ArchitectureDomain {
  title: string;
  depends_on: string[];
  related_domains: string[];
  endpoints: string[];
  requires_auth: boolean;
  pages: string[];
}
