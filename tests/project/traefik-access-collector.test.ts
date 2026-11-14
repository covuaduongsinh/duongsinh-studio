import { describe, expect, it } from 'vitest';

import { hostsOf, keepLine } from '../../deploy/nb3-exec/ds-traefik-access.mjs';

const hosts = hostsOf({
  apps: {
    'nb3-a': { hosts: ['Edu.dsc.edu.vn'] },
    'nb3-b': { hosts: ['lms.dsc.edu.vn'] },
    'nb3-c': {},
  },
});

describe('Traefik access log collector', () => {
  it('collects the host names of every configured app, in lower case', () => {
    expect([...hosts].sort()).toEqual(['edu.dsc.edu.vn', 'lms.dsc.edu.vn']);
  });

  it('keeps only three fields of a request to an app host', () => {
    const line = JSON.stringify({
      RequestHost: 'EDU.dsc.edu.vn',
      RequestPath: '/main/api/app',
      StartUTC: '2026-11-14T01:00:00.123Z',
      ClientAddr: '1.2.3.4:5',
      RequestMethod: 'POST',
    });
    expect(JSON.parse(keepLine(line, hosts)!)).toEqual({
      RequestHost: 'edu.dsc.edu.vn',
      RequestPath: '/main/api/app',
      StartUTC: '2026-11-14T01:00:00.123Z',
    });
  });

  it('drops other hosts, text that is not JSON and lines without a time', () => {
    const other = JSON.stringify({
      RequestHost: 'nocobase.dsc.edu.vn',
      RequestPath: '/',
      StartUTC: '2026-11-14T01:00:00Z',
    });
    expect(keepLine(other, hosts)).toBeNull();
    expect(keepLine('time="x" level=info msg="y"', hosts)).toBeNull();
    expect(keepLine('{"RequestHost":"edu.dsc.edu.vn"}', hosts)).toBeNull();
    expect(keepLine('{broken', hosts)).toBeNull();
  });
});
