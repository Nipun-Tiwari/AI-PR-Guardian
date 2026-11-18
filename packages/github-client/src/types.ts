export interface GitHubClientConfig {
  appId: number;
  privateKey: string;
  apiVersion?: string;
}

export interface RepositoryInfo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  url: string;
  headSha: string;
  baseSha: string;
  owner: string;
  repo: string;
}

export interface PullRequestFile {
  filename: string;
  previousFilename?: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  patch?: string;
  additions: number;
  deletions: number;
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
}
