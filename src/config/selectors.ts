import type { DocFramework } from '../types/domain.js';

export interface FrameworkSelectors {
  sidebar: string[];
  mainContent: string[];
  title: string[];
  breadcrumbs: string[];
  remove: string[];
  navLinks: string[];
  endpointBadge: string[];
  codeBlocks: string[];
  tables: string[];
}

export const FRAMEWORK_SELECTORS: Record<DocFramework, FrameworkSelectors> = {
  readme: {
    sidebar: [
      '[data-testid="sidebar"]',
      '.rm-Sidebar',
      'nav[class*="Sidebar"]',
      '.Sidebar',
      '#sidebar',
      'aside nav',
    ],
    mainContent: [
      '[data-testid="RDMD"]',
      '.rm-Article',
      'article.rm-Article',
      '.markdown-body',
      'main article',
      '[role="main"] article',
    ],
    title: ['h1', '.rm-Article h1', '[data-testid="page-title"]'],
    breadcrumbs: ['.rm-Breadcrumbs', 'nav[aria-label="breadcrumb"]', '.breadcrumb'],
    remove: [
      '.rm-Sidebar',
      '.rm-Header',
      'header',
      'footer',
      '.rm-Feedback',
      '[data-testid="footer"]',
      '.search-bar',
      '#hub-search',
      '.rm-PageThumbs',
      '.rm-SuggestEdits',
    ],
    navLinks: [
      '.rm-Sidebar a[href]',
      'nav a[href]',
      '[data-testid="sidebar"] a[href]',
    ],
    endpointBadge: [
      '.rm-APIMethod',
      '[class*="HTTPMethod"]',
      '[class*="method-"]',
      '.api-method',
    ],
    codeBlocks: ['pre code', '.rm-CodeBlock pre', 'pre'],
    tables: ['table', '.rm-Table'],
  },
  docusaurus: {
    sidebar: ['.theme-doc-sidebar-container', '.menu', 'nav.menu'],
    mainContent: ['article', 'main .markdown', '.theme-doc-markdown'],
    title: ['h1', 'header h1'],
    breadcrumbs: ['.breadcrumbs', 'nav[aria-label="Breadcrumbs"]'],
    remove: ['nav', 'footer', '.theme-doc-sidebar-container', '.navbar'],
    navLinks: ['.menu__link', '.theme-doc-sidebar-menu a'],
    endpointBadge: ['.badge', '.api-method'],
    codeBlocks: ['pre code', 'pre'],
    tables: ['table'],
  },
  mintlify: {
    sidebar: ['#sidebar', 'nav#navigation', '[class*="sidebar"]'],
    mainContent: ['#content-area', 'article', 'main'],
    title: ['h1'],
    breadcrumbs: ['[class*="breadcrumb"]'],
    remove: ['#sidebar', 'footer', 'header', '#navbar'],
    navLinks: ['#sidebar a', 'nav a[href]'],
    endpointBadge: ['[class*="method"]', '.api-method'],
    codeBlocks: ['pre code', 'pre'],
    tables: ['table'],
  },
  redoc: {
    sidebar: ['.menu-content', 'nav'],
    mainContent: ['.redoc-wrap', '[role="main"]'],
    title: ['h1'],
    breadcrumbs: [],
    remove: ['nav', 'footer'],
    navLinks: ['.menu-content a'],
    endpointBadge: ['.http-verb'],
    codeBlocks: ['pre'],
    tables: ['table'],
  },
  'swagger-ui': {
    sidebar: ['.sidebar', '.opblock-tag-section'],
    mainContent: ['.swagger-ui', '#swagger-ui'],
    title: ['h2', '.title'],
    breadcrumbs: [],
    remove: ['.topbar'],
    navLinks: ['.opblock-tag a', 'a[href]'],
    endpointBadge: ['.opblock-summary-method'],
    codeBlocks: ['pre'],
    tables: ['table'],
  },
  stoplight: {
    sidebar: ['[class*="Sidebar"]', 'nav'],
    mainContent: ['[class*="Article"]', 'main'],
    title: ['h1'],
    breadcrumbs: [],
    remove: ['nav', 'footer', 'header'],
    navLinks: ['nav a[href]'],
    endpointBadge: ['[class*="HttpMethod"]'],
    codeBlocks: ['pre code'],
    tables: ['table'],
  },
  gitbook: {
    sidebar: ['[data-testid="toc"]', 'aside nav'],
    mainContent: ['main', 'article'],
    title: ['h1'],
    breadcrumbs: [],
    remove: ['aside', 'footer', 'header'],
    navLinks: ['aside a[href]'],
    endpointBadge: [],
    codeBlocks: ['pre code'],
    tables: ['table'],
  },
  unknown: {
    sidebar: ['nav', 'aside', '[role="navigation"]'],
    mainContent: ['main', 'article', '[role="main"]', '.content'],
    title: ['h1'],
    breadcrumbs: ['nav[aria-label*="breadcrumb" i]'],
    remove: ['nav', 'footer', 'header', 'aside', '.sidebar'],
    navLinks: ['nav a[href]', 'aside a[href]'],
    endpointBadge: ['[class*="method"]'],
    codeBlocks: ['pre code', 'pre'],
    tables: ['table'],
  },
};

export const FRAMEWORK_DETECTORS: Array<{ framework: DocFramework; patterns: RegExp[] }> = [
  { framework: 'readme', patterns: [/readme\.io/i, /rm-Sidebar/i, /rm-Article/i, /data-readme/i] },
  { framework: 'docusaurus', patterns: [/docusaurus/i, /theme-doc/i, /__docusaurus/i] },
  { framework: 'mintlify', patterns: [/mintlify/i, /mint\.dev/i, /#content-area/i] },
  { framework: 'redoc', patterns: [/redoc/i, /\.redoc-wrap/i] },
  { framework: 'swagger-ui', patterns: [/swagger-ui/i, /#swagger-ui/i] },
  { framework: 'stoplight', patterns: [/stoplight/i, /elements-api/i] },
  { framework: 'gitbook', patterns: [/gitbook/i, /gitbook\.io/i] },
];
