import type { Application } from '@nocobase/app-server/application';
import {
  agentsToken,
  commandRef,
  type BriefSectionProvider,
} from '@nocobase/app-plugin-agents/server/tokens';
import {
  projectsToken,
  type Projects,
} from '@nocobase/app-plugin-projects/server/tokens';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { ISSUE_SUBJECT } from '../agents/ids.js';
import type { GitService } from '../git/service.js';
import { MEMORY_DIR } from '../memory/parse.js';
import {
  createMemoryService,
  type MemoryService,
  type RepositoryMemory,
} from '../memory/service.js';
import { gitServiceToken } from './git.js';

export const memoryServiceToken: ServiceToken<MemoryService> =
  createServiceToken<MemoryService>('app/project-memory');

/** The brief section stays short: past this many lines it says how many more there are. */
const SECTION_LINES = 50;

interface PreparedMemory {
  readonly projectId: string;
  readonly repositories: readonly RepositoryMemory[];
}

/**
 * The issue's project memory, read from GitHub before the claim's transaction (`prepare`), written into the brief's
 * context layer inside it (`section`, no reads at all). Nothing when the issue's project has no repository with memory,
 * or GitHub cannot be reached: memory helps a run, it never holds one up.
 */
export function createMemorySection(deps: {
  readonly memory: () => MemoryService;
  readonly git: () => GitService;
  readonly projects: () => Projects;
  readonly connection: () => DatabaseConnection;
  readonly onError?: (error: unknown) => void;
}): BriefSectionProvider {
  return {
    key: 'duongsinh-studio/project-memory',
    order: 50,
    async prepare(run): Promise<PreparedMemory | null> {
      if (run.subject.kind !== ISSUE_SUBJECT) return null;
      try {
        const projectId = (
          await deps.projects().issueContext.contextFor(deps.connection(), run.subject.id)
        )?.project?.id;
        if (!projectId) return null;
        const repositories: RepositoryMemory[] = [];
        for (const repository of await deps.git().listRepositories()) {
          const link = repository.projects.find((item) => item.projectId === projectId);
          if (!link) continue;
          const read = await deps.memory().readRepository(repository);
          if (read.memories.length === 0) continue;
          if (link.isPrimary) repositories.unshift(read);
          else repositories.push(read);
        }
        return repositories.length ? { projectId, repositories } : null;
      } catch (error) {
        deps.onError?.(error);
        return null;
      }
    },
    async section(_conn, claim, _assembly, prepared) {
      const memory = prepared as PreparedMemory | null | undefined;
      if (!memory?.repositories.length) return null;
      const read = commandRef(claim.cli, 'memory read');
      const lines = [
        '## Ghi nhớ của dự án (project memory)',
        '',
        `Những điều dự án đã ghi nhớ trong \`${MEMORY_DIR}/\` ở nhánh mặc định: phản hồi của chủ dự án (feedback), quyết định của dự án (project), tài liệu tham chiếu (reference). Làm theo chúng; đọc toàn văn ở file cùng tên trong thư mục làm việc, hoặc ${read} \`${memory.projectId} <repoId> --path <path>\`.`,
      ];
      const items: string[] = [];
      for (const repository of memory.repositories) {
        items.push('', `### ${repository.repo} (${repository.ref ?? repository.branch}, repoId \`${repository.repositoryId}\`)`);
        for (const item of repository.memories)
          items.push(
            `- [${item.type ?? '?'}] **${item.name}**${item.description ? ` — ${item.description}` : ''} (\`${item.path}\`)`,
          );
      }
      const room = SECTION_LINES - lines.length;
      if (items.length > room) {
        const left = items.length - (room - 1);
        lines.push(...items.slice(0, room - 1), `- … và ${left} dòng nữa (xem \`${MEMORY_DIR}/\`).`);
      } else lines.push(...items);
      return lines.join('\n');
    },
  };
}

/** Project memory (S4): the service the routes read through, and its section in every issue run's brief. */
export default class MemoryProvider extends ServiceProvider<Application> {
  readonly name = 'app/project-memory';
  private release?: () => void;

  override register(): void {
    const { container } = this.app;
    container.singleton(memoryServiceToken, () =>
      createMemoryService({
        client: (repositoryId) => container.resolve(gitServiceToken).clientForRepository(repositoryId),
      }),
    );
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(agentsToken) || !container.has(projectsToken)) return;
    this.release = container.resolve(agentsToken).briefs.sections.register(
      createMemorySection({
        memory: () => container.resolve(memoryServiceToken),
        git: () => container.resolve(gitServiceToken),
        projects: () => container.resolve(projectsToken),
        connection: () => container.resolve(databaseManagerToken).connection(),
        onError: (error) => console.error('Project memory for a brief could not be read.', error),
      }),
    );
  }

  override async shutdown(): Promise<void> {
    this.release?.();
    this.release = undefined;
  }
}
