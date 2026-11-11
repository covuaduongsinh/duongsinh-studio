import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    secrets: {
      keys: [
        { version: 1, key: 'test-secrets-key-at-least-32-characters-long' },
      ],
    },
  },
});

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

test(
  'H1a: issue criteria and project default criteria endpoints',
  { timeout: 180_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const { container } = app;
    const db = container.resolve(databaseManagerToken);
    const conn = db.connection();

    // 1. Unauthenticated requests return 401
    const unauthGet = await request('/issues/issue-test-1/criteria');
    expect(unauthGet.status).toBe(401);

    const unauthPut = await request(
      '/issues/issue-test-1/criteria',
      json({ criteria: [] }, 'PUT'),
    );
    expect(unauthPut.status).toBe(401);

    const unauthGetDef = await request('/projects/proj-1/defaultCriteria');
    expect(unauthGetDef.status).toBe(401);

    // Chuẩn bị một project và một issue qua API chính thức
    const projectRes = await admin.fetch(
      '/projects',
      json({ name: 'Criteria Test Project' }),
    );
    expect(projectRes.status).toBe(201);
    const project = ((await projectRes.json()) as { data: { id: string } })
      .data;
    const projectId = project.id;

    const issueRes = await admin.fetch(
      '/projects/issues',
      json({
        title: 'Issue with criteria',
        projectId,
      }),
    );
    expect(issueRes.status).toBe(201);
    const issue = ((await issueRes.json()) as { data: { id: string } }).data;
    const issueId = issue.id;

    // 2. GET /issues/:issueId/criteria lúc đầu rỗng
    const resEmpty = await admin.fetch(`/issues/${issueId}/criteria`);
    expect(resEmpty.status).toBe(200);
    const dataEmpty = (await resEmpty.json()) as { data: unknown[] };
    expect(dataEmpty.data).toEqual([]);

    // 3. PUT /issues/:issueId/criteria lưu danh sách tiêu chí
    const newCriteria = [
      {
        text: 'Unit test chạy qua',
        checkKind: 'test',
        checkValue: 'tests/server/example.test.ts',
      },
      {
        text: 'CI check xanh trên GitHub Actions',
        checkKind: 'ci',
      },
      {
        text: 'Xác nhận giao diện hiển thị đúng',
        checkKind: 'human',
      },
    ];

    const putRes = await admin.fetch(
      `/issues/${issueId}/criteria`,
      json({ criteria: newCriteria }, 'PUT'),
    );
    expect(putRes.status).toBe(200);

    const getRes = await admin.fetch(`/issues/${issueId}/criteria`);
    expect(getRes.status).toBe(200);
    const getJson = (await getRes.json()) as {
      data: {
        id: string;
        text: string;
        checkKind: string;
        checkValue: string | null;
        position: number;
        source: string;
      }[];
    };
    expect(getJson.data).toHaveLength(3);
    expect(getJson.data[0].text).toBe('Unit test chạy qua');
    expect(getJson.data[0].checkKind).toBe('test');
    expect(getJson.data[0].checkValue).toBe('tests/server/example.test.ts');
    expect(getJson.data[0].position).toBe(0);
    expect(getJson.data[1].checkKind).toBe('ci');
    expect(getJson.data[2].checkKind).toBe('human');

    // 4. POST /issues/:issueId/criteria/propose (đề xuất tiêu chí)
    const proposeRes = await admin.fetch(
      `/issues/${issueId}/criteria/propose`,
      json({
        criteria: [
          {
            text: 'Tiêu chí đề xuất bởi agent',
            checkKind: 'command',
            checkValue: 'pnpm exec vitest run tests/server/example.test.ts',
          },
        ],
      }),
    );
    expect(proposeRes.status).toBe(200);

    const getAfterPropose = await admin.fetch(`/issues/${issueId}/criteria`);
    const afterProposeJson = (await getAfterPropose.json()) as {
      data: {
        id: string;
        text: string;
        checkKind: string;
        checkValue: string | null;
        position: number;
      }[];
    };
    expect(afterProposeJson.data).toHaveLength(4);
    expect(afterProposeJson.data[3].text).toBe('Tiêu chí đề xuất bởi agent');
    expect(afterProposeJson.data[3].position).toBe(3);

    // Kiểm tra activity criteria_changed được ghi
    const activities = await conn.query
      .selectFrom('pmActivities')
      .selectAll()
      .where('issueId', '=', issueId)
      .where('action', '=', 'criteria_changed')
      .execute();
    expect(activities.length).toBeGreaterThan(0);

    // 5. Default criteria của dự án
    const defaultCriteria = [
      {
        text: 'Kiểm tra eslint không có cảnh báo',
        checkKind: 'command',
        checkValue: 'pnpm exec eslint <file>',
      },
      {
        text: 'Kiểm tra prettier đúng định dạng',
        checkKind: 'command',
        checkValue: 'pnpm exec prettier --check <file>',
      },
    ];

    const putDefRes = await admin.fetch(
      `/projects/${projectId}/defaultCriteria`,
      json({ criteria: defaultCriteria }, 'PUT'),
    );
    expect(putDefRes.status).toBe(200);

    const getDefRes = await admin.fetch(
      `/projects/${projectId}/defaultCriteria`,
    );
    expect(getDefRes.status).toBe(200);
    const getDefJson = (await getDefRes.json()) as {
      data: { text: string; checkKind: string; position: number }[];
    };
    expect(getDefJson.data).toHaveLength(2);
    expect(getDefJson.data[0].text).toBe('Kiểm tra eslint không có cảnh báo');

    // 6. Tạo một issue mới trong project này, kiểm tra tiêu chí mặc định được tự động copy
    const newIssueRes = await admin.fetch(
      '/projects/issues',
      json({
        title: 'New issue with auto-copied criteria',
        projectId,
      }),
    );
    expect(newIssueRes.status).toBe(201);
    const newIssue = ((await newIssueRes.json()) as { data: { id: string } })
      .data;

    const newIssueCriteriaRes = await admin.fetch(
      `/issues/${newIssue.id}/criteria`,
    );
    expect(newIssueCriteriaRes.status).toBe(200);
    const newIssueCriteriaJson = (await newIssueCriteriaRes.json()) as {
      data: { text: string; checkKind: string; source: string }[];
    };
    expect(newIssueCriteriaJson.data).toHaveLength(2);
    expect(newIssueCriteriaJson.data[0].text).toBe(
      'Kiểm tra eslint không có cảnh báo',
    );
    expect(newIssueCriteriaJson.data[0].source).toBe('projectDefault');
  },
);
