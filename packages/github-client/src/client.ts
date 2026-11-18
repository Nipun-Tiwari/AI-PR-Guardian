import { decodePrivateKey } from './privateKey.js';
import { withRetry } from './retry.js';
import type {
  FileContent,
  GitHubClientConfig,
  PullRequestFile,
  PullRequestInfo,
  RepositoryInfo,
} from './types.js';

const DEFAULT_API_VERSION = '2022-11-28';

type OctokitInstance = {
  request: (route: string, options?: Record<string, unknown>) => Promise<{ data: unknown }>;
  pulls: {
    get: (options: Record<string, unknown>) => Promise<{
      data: {
        number: number;
        title: string;
        html_url: string;
        head: { sha: string };
        base: { sha: string };
      };
    }>;
    listFiles: unknown;
  };
  repos: {
    getContent: (options: Record<string, unknown>) => Promise<{ data: unknown }>;
  };
  paginate: {
    iterator: (
      endpoint: unknown,
      options: Record<string, unknown>,
    ) => AsyncIterable<{ data: Array<Record<string, unknown>> }>;
  };
};

async function createInstallationOctokit(options: {
  appId: number;
  privateKey: string;
  installationId: number;
  apiVersion: string;
}): Promise<OctokitInstance> {
  // Octokit packages are ESM-only; load them via dynamic import from CJS output.
  const [{ createAppAuth }, { Octokit }] = await Promise.all([
    import('@octokit/auth-app'),
    import('@octokit/rest'),
  ]);

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: options.appId,
      privateKey: options.privateKey,
      installationId: options.installationId,
    },
    request: {
      headers: {
        'X-GitHub-Api-Version': options.apiVersion,
      },
    },
  }) as unknown as OctokitInstance;
}

export class GitHubAppClient {
  private readonly appId: number;
  private readonly privateKey: string;
  private readonly apiVersion: string;

  constructor(config: GitHubClientConfig) {
    this.appId = config.appId;
    this.privateKey = decodePrivateKey(config.privateKey);
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  }

  /** Create an Octokit client authenticated as a GitHub App installation. Tokens are never persisted. */
  async getInstallationOctokit(installationId: number | bigint): Promise<OctokitInstance> {
    const installationIdNumber =
      typeof installationId === 'bigint' ? Number(installationId) : installationId;

    return createInstallationOctokit({
      appId: this.appId,
      privateKey: this.privateKey,
      installationId: installationIdNumber,
      apiVersion: this.apiVersion,
    });
  }

  async getRepository(
    installationId: number | bigint,
    repositoryId: number | bigint,
  ): Promise<RepositoryInfo> {
    const octokit = await this.getInstallationOctokit(installationId);
    const repoId = typeof repositoryId === 'bigint' ? Number(repositoryId) : repositoryId;

    const { data } = await withRetry(() =>
      octokit.request('GET /repositories/{repository_id}', {
        repository_id: repoId,
      }),
    );

    const repo = data as {
      id: number;
      owner: { login: string };
      name: string;
      full_name: string;
    };

    return {
      id: repo.id,
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
    };
  }

  async getPullRequest(
    installationId: number | bigint,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PullRequestInfo> {
    const octokit = await this.getInstallationOctokit(installationId);

    const { data } = await withRetry(() =>
      octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      }),
    );

    return {
      number: data.number,
      title: data.title,
      url: data.html_url,
      headSha: data.head.sha,
      baseSha: data.base.sha,
      owner,
      repo,
    };
  }

  async listPullRequestFiles(
    installationId: number | bigint,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PullRequestFile[]> {
    const octokit = await this.getInstallationOctokit(installationId);
    const files: PullRequestFile[] = [];

    await withRetry(async () => {
      files.length = 0;
      for await (const response of octokit.paginate.iterator(octokit.pulls.listFiles, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      })) {
        for (const file of response.data) {
          const mapped: PullRequestFile = {
            filename: String(file['filename']),
            status: file['status'] as PullRequestFile['status'],
            additions: Number(file['additions'] ?? 0),
            deletions: Number(file['deletions'] ?? 0),
          };
          if (typeof file['previous_filename'] === 'string') {
            mapped.previousFilename = file['previous_filename'];
          }
          if (typeof file['patch'] === 'string') {
            mapped.patch = file['patch'];
          }
          files.push(mapped);
        }
      }
    });

    return files;
  }

  async getFileContent(
    installationId: number | bigint,
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<FileContent | null> {
    const octokit = await this.getInstallationOctokit(installationId);

    try {
      const { data } = await withRetry(() =>
        octokit.repos.getContent({
          owner,
          repo,
          path,
          ref,
        }),
      );

      if (
        Array.isArray(data) ||
        !data ||
        typeof data !== 'object' ||
        (data as { type?: string }).type !== 'file' ||
        !('content' in data) ||
        typeof (data as { content?: unknown }).content !== 'string'
      ) {
        return null;
      }

      const file = data as { path: string; content: string; encoding?: string; sha: string };

      return {
        path: file.path,
        content: Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8').toString(
          'utf8',
        ),
        sha: file.sha,
      };
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'status' in error &&
        (error as { status: number }).status === 404
      ) {
        return null;
      }
      throw error;
    }
  }
}
