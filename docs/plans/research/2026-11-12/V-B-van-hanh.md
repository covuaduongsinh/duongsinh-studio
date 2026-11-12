# B — Kiểm toán ma sát vận hành Dương Sinh Studio (chỉ đọc, 12/11/2026)

Đối tượng: `/home/claude/duongsinh-studio` (branch `main` @ `20d20d7`). Cách làm: grep/đọc mã ở `server/routes`, `server/releases`,
`server/providers`, `server/playbooks`, `server/runner`, `deploy/dokploy`, `docs/*.md`, `docs/plans/*.md`, `.agents/rules`, README của
plugin `releases`/`agents` trong `node_modules`. Không sửa, không commit. Mọi dòng "bằng chứng" là `file:dòng` trong repo; chỗ nào
chưa xác minh được trên VPS/Dokploy thật thì ghi rõ "chưa kiểm".

Bối cảnh đã xác nhận trong mã: driver `dokploy` không có `exec`, không có log runtime (`server/releases/dokploy-driver.ts:201`,
`:529-536`); client Dokploy chỉ có `create/get/update/deploy/stop/start/remove` (`server/previews/dokploy.ts:62-76`); runner dùng chung
không có nhóm `docker` (`docs/trien-khai-vps.md:203-205`); `maxApps` đếm trên toàn bộ bảng `dsNb3Apps` chứ không theo môi trường
(`dokploy-driver.ts:244-257`); compose của app NB3 chỉ có **một** service app nhận toàn bộ `.env` (`server/releases/nb3-compose.ts:155-187`);
không tài liệu nào ghi NocoEdu production đang chạy ở đâu (grep `nocoedu` trong `docs/` chỉ ra ví dụ tên miền ở
`docs/plans/2026-11-08-m4-1-do-dac-vps.md:52`); RAM khả dụng ≈ 0,5 GiB khi runner bận (`docs/plans/2026-11-08-m4-1-do-dac-vps.md:37`).

---

## 1. Bảng tổng hợp

Mức: **S1** = chặn việc/ mất dữ liệu/ lộ bí mật; **S2** = tốn tay nhiều, dễ sai; **S3** = khó chịu, có cách vòng. Công = ngày-agent ước lượng
(chưa gồm thời gian chủ dự án duyệt).

| #   | Luồng                                  | Ma sát hôm nay                                                                                                                                                                                     | Bằng chứng                                                                                                                                              | Mức | Ý tưởng sửa                                                                                                                                                                      | Công |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Đăng ký app NB3 mới                    | ~12 bước tay trải trên 4 hệ (GitHub, Mắt Bão DNS, Dokploy/VPS, Studio UI) + 1 bước CLI; không có UI cho khoá CI; file workflow phải đẩy bằng token cá nhân vì GitHub App thiếu quyền `workflows` | `docs/xem-thu-app-nb3.md:16-22`, `docs/trien-khai-vps.md:189-197`, `server/setups/ci-workflow.ts:14-16`, `server/routes/builds.ts:882-927` (không có client gọi) | S2  | Playbook "Nối app NB3" = 1 route `POST /api/nb3Apps/register` làm: tạo env plugin + App + gán `dsRepositoryApps` + khoá CI phạm vi 1 App + sinh workflow; UI checklist các bước tay còn lại (DNS, secret GitHub) | 3    |
| 2   | Tạo dự án → deploy                     | `projectSetups` nhận `deploy: true` nhưng chỉ trả `deployLater`, `apps: []`                                                                                                                          | `server/routes/project-setups.ts:527-542`, `server/locales/vi-VN.ts:146`                                                                                | S3  | Nối bước 1 vào `projectSetups` (tạo App xem thử + workflow preview luôn)                                                                                                         | 1    |
| 3   | Đăng ký app **đã chạy** (NocoEdu)      | Không có đường "nhận" compose có sẵn: driver luôn `create` compose mới `nb3-<slug>`, client từ chối id không do Studio ghi; cách duy nhất là tạo compose mới + chuyển dữ liệu tay + đổi DNS         | `dokploy-driver.ts:289-314`, `server/previews/dokploy.ts:171-190`                                                                                       | S2  | Lệnh `nb3 adopt` (chỉ root): ghi row `dsNb3Apps` với `composeId` có sẵn **nếu** compose tên `nb3-*` trong project Studio; kèm tài liệu "di dời app từ compose tay"            | 2    |
| 4   | Chạy lệnh trong app đã deploy          | Không có `exec`, không có `logs`; hợp đồng driver của plugin cũng không có `exec`; Dokploy REST không có exec; runner không có docker; không SSH                                                   | `dokploy-driver.ts:201,529-536`, `node_modules/@nocobase/app-plugin-releases/dist/server/drivers/types.d.ts:14-31,201`, `docs/trien-khai-vps.md:203-205` | S1  | Daemon host nhỏ (root, unix socket mount vào Studio) chạy `docker compose run --rm <app> node dist/cli/index.js <cmd>` theo allowlist + `docker logs`; Studio thêm route job/log (mục 4) | 4    |
| 5   | Log runtime của app                    | `logs.available=false`; `status()` chỉ đọc bảng `dsNb3Apps`, không hỏi lại Dokploy/Docker → container chết vẫn hiện `running`; lỗi deploy chỉ nói "xem log trong Dokploy"                          | `dokploy-driver.ts:507-526`, `:284`                                                                                                                      | S1  | Cùng daemon ở #4: `docker logs --since` và `docker inspect` → `logs()` + `status()` thật; probe `/api/healthz` định kỳ (đã có `answers()` ở `:91-95`)                               | (gộp #4) |
| 6   | Biến/bí mật → App                      | Mọi biến (env + App) vào `.env` của compose, `env_file` cho **một** service app → bí mật job (LARK_APP_SECRET) nằm trong container web; không có "biến chỉ cho job"                                | `nb3-compose.ts:171-172`, `dokploy-driver.ts:389-394`, `docs/chenh-lech-upstream.md` §33 mục 4                                                           | S1  | Bí mật job đi theo kênh job (#4): file env `root:0600` trên host, chỉ `docker compose run -e` đọc; cấm đặt `LARK_*` ở tab Biến của App (kiểm tên trong `nb3ComposeEnv`)             | 1    |
| 7   | Khoá CI Studio cấp                     | `issueCiKey` cấp `releases.apps: write` **mọi App**, 365 ngày, không giới hạn `objects` → khoá của repo A upload/deploy/dừng được App production của repo B                                        | `server/routes/builds.ts:829-880` (`scope.groups['releases.apps']={level:'write'}`), README plugin `releases` dòng 80 (có hỗ trợ giới hạn App)          | S1  | Thêm `objects: [appIds của repo]` khi cấp; hạ hạn 90 ngày (preset "CI deploy"); xoay khi gỡ App                                                                                  | 0,5  |
| 8   | Bí mật trên đĩa/Dokploy                | Dokploy ghi `.env` của compose ra `/etc/dokploy/compose/<appName>/code/.env` và DB Dokploy (plaintext); khoá Dokploy Studio giữ là khoá **toàn tài khoản** (production NB2 cùng tài khoản)          | `docs/plans/2026-11-12-nhat-ky-dot-harness-h.md:41`, `server/previews/dokploy.ts:1-7`, `docs/trien-khai-vps.md:166-168`                                 | S2  | Chấp nhận với bí mật của app (không tránh được với Dokploy), nhưng **không** đưa bí mật tích hợp (Lark) qua kênh này; đề nghị Dokploy tạo API key riêng cho project Studio nếu bản cài hỗ trợ | 0,5  |
| 9   | Quét bí mật trong issue/PR             | Regex không bắt `LARK_APP_SECRET=`, `DB_PASSWORD=`, `SECRETS_KEYS=`, khoá Dokploy, khoá `ds-studio`; chỉ bắt `api_key/secret_key/access_token/auth_token/private_key`                               | `server/security/secret-patterns.ts:78-84`                                                                                                              | S2  | Thêm mẫu `(?:[A-Z_]*(SECRET|PASSWORD|TOKEN|KEYS?))\s*[:=]\s*\S{12,}` + mẫu riêng khoá Studio/Dokploy                                                                             | 0,5  |
| 10  | Lark trên runner                       | Repo không có gì về `lark-cli`: không script cài, không chỗ để `.lark/config.yaml`, không nói auth; playbook `!nhap-lark` đòi test `tests/server/lark-sync.test.ts` không tồn tại; runner **cấm** để token khác (`trien-khai-vps.md:210`) | `server/playbooks/definitions.ts:88-127`, `server/runner/service.ts:50-54`, `docs/runner-resource-limits-proposal.md:16,32`                              | S2  | Không cài `lark-cli` (OAuth trình duyệt, build từ Go); import dùng **tenant token** của app Lark trong lệnh `import-lark` của chính nocoedu, chạy qua kênh job #4, bí mật theo #6 | 1 (tài liệu + playbook) |
| 11  | `maxApps`/RAM                          | Đếm toàn cục trên `dsNb3Apps` nhưng ngưỡng lấy theo env đang deploy → 1 app production chạy chặn preview của mọi repo; `maxApps` ≤ 2 cứng; driver NB3 **không** có cổng RAM như preview NB2 (1,2 GB) | `dokploy-driver.ts:244-257,124`, `server/previews/service.ts:34-36` (chỉ NB2), `docs/plans/2026-11-08-m4-1-do-dac-vps.md:32-37`                          | S1  | Thay đếm bằng **ngân sách RAM**: mỗi App khai `mem` (1 GiB + 384 MiB nếu Postgres); trước deploy/start đọc `hostAvailableMb()` (đã có) và từ chối khi < tổng + 1,2 GiB; `maxApps` theo env | 1,5  |
| 12  | Tự dừng "khi rảnh"                     | Thực tế dừng N phút **sau khi bật** (không đo lưu lượng); tài liệu nói "không dùng"; bật tay lại cũng dừng tiếp sau N phút vì giữ `idleStopMinutes`                                                 | `dokploy-driver.ts:550-575,449-464`, `docs/trien-khai-vps.md:186`, `docs/xem-thu-app-nb3.md:4`                                                            | S2  | Đổi chữ trong UI/tài liệu thành "tự dừng sau N phút kể từ lúc bật"; sau này đọc `lastAccessedAt` từ log Traefik qua daemon #4                                                     | 0,5  |
| 13  | Hiển thị RAM cho chủ dự án             | Không có: trang `/environments` hiện seed NB2 (preview `maxApps 2`, wildcard `pr-{number}`), trang env plugin chỉ có `{database, maxApps}`; `/api/runner/recommendations` không có UI và `estimatedPeakMemoryMb` là hằng 1850 | `database/main/seeds/202611060001_ds_environments.ts:21-64`, `dokploy-driver.ts:439`, `server/runner/service.ts:113-114`, không file client nào gọi `runner/recommendations` | S2  | Thẻ "Máy chủ" trên Releases hub: RAM khả dụng (`/proc/meminfo`), app đang chạy + mem_limit, runner bận/rảnh; bỏ hằng số                                                           | 1,5  |
| 14  | Sao lưu DB app                         | `backup.sh` chỉ dump DB Studio + tar `storage/` (gồm cả `storage/nb3-apps/*/dist` ~80 MB/bản); volume `pgdata`/`storage` của compose `nb3-*` **không** được sao lưu; `DELETE App` xoá volume ngay   | `deploy/dokploy/backup.sh:10-15`, `nb3-compose.ts:133-134,215-217`, `dokploy-driver.ts:494-501`                                                           | S1  | Thêm vào cron: với mỗi compose `nb3-*` chạy `pg_dump` (hoặc copy sqlite+storage) vào `backups/nb3/<app>-<ngày>`; driver `remove(purge)` phải chụp dump trước; loại `nb3-apps/*/dist` khỏi tar | 1    |
| 15  | Quay lui app                           | Plugin có `POST /apps/:appId/rollback` nhưng chỉ đổi `dist`; không có snapshot DB trước migration → rollback sau migration = mất tương thích; không tài liệu                                     | README plugin `releases` dòng 95; `docs/trien-khai-vps.md:87-91` chỉ nói Studio                                                                         | S2  | Quy ước: deploy production app = dump DB trước (daemon #4) + ghi `backupRef` vào deployment labels                                                                                 | (gộp #14) |
| 16  | Release Studio (build WSL + SSH root)  | 6 lệnh tay + chờ "không còn run" + tạm dừng tự lái + đổi env Dokploy + dọn bản cũ tay; từng mất ~2 giờ chờ; từng in khoá API ra phiên                                                             | `docs/trien-khai-vps.md:30-58`, `docs/plans/2026-11-09-nhat-ky-m2-m4-2-nocolms.md:29-30,73-75`                                                           | S2  | Build tarball trên GitHub Actions (tag `v*`) → artifact; script `deploy/dokploy/release.sh` trên VPS tải + giải nén + đổi `STUDIO_RELEASE` + dọn 3 bản; Studio tự "drain" run     | 2    |
| 17  | Hai bản checkout (Windows/WSL)         | Không `.gitattributes`; clone bằng `gh.exe` ra CRLF (đã dính); build native sai nếu chạy ở Windows; hai thư mục lệch commit; `/mnt/d` chậm                                                        | `docs/plans/2026-11-09-nhat-ky-m2-m4-2-nocolms.md:79`, `docs/moi-truong-dev.md:13-14,81-82`, `.agents/rules/duongsinh-studio.md:86-88`, không có `.gitattributes` | S2  | Một nguồn: WSL `~/code`; Orca mở qua `\\wsl.localhost\Ubuntu\home\duongsinh\code\...`; thêm `.gitattributes` `* text=auto eol=lf`; `pnpm build` tự từ chối khi `process.platform!=='linux'` và `--target linux-x64` | 0,5  |
| 18  | Quan sát "vì sao việc này chậm"        | Thời gian chờ hàng đợi chỉ hiện khi run còn `queued`, chạy rồi mất; không timeline theo issue (intake→run→PR→CI→review→merge→deploy); CI không lưu thời lượng; chỉ có p50 cycle time tổng           | `client/pages/issues/detail/issue-runs.tsx:55-66`, `database/main/migrations/202611100003_ds_git_contract.ts:11-22` (chỉ `reportedAt`), `server/reports/service.ts:129-149` | S2  | Tab "Dòng thời gian" trên trang issue: mốc từ `agRuns.createdAt/startedAt/finishedAt`, `dsPullRequests`, `dsReportedChecks`, `dsVerifications`, `dsReviews`; lưu `startedAt/completedAt` của check | 2    |
| 19  | Playbook sai lệnh                      | `!tao-app-nocobase` kiểm bằng `pnpm nocobase app:test` (không có lệnh này); `!deploy-dokploy` tiêu chí `pnpm build` và `!nang-template` `pnpm typecheck` trái luật runner; `!nhap-lark` test không tồn tại | `server/playbooks/definitions.ts:76-79,157-160,31-37,122-125`, `.agents/rules/duongsinh-studio.md:120-122`                                                | S2  | Rà 4 playbook: tiêu chí `command` chỉ được là lệnh scoped; thêm test `tests/server/playbooks-commands.test.ts` chặn `pnpm build/check/test/typecheck`                             | 0,5  |
| 20  | Quyền trong Studio UI                  | `ds-admin` chỉ có `view/read-logs/deploy`; không `operate` (bật/dừng), `configure` (biến), `create` → mọi việc vận hành app rơi về chủ dự án (root); khoá API cá nhân không có quyền quản trị       | `database/main/seeds/202611060002_ds_roles_releases.ts:31-34`, `docs/plans/2026-11-09-nhat-ky-m2-m4-2-nocolms.md:43-45,84`                                | S3  | Thêm `operate.all` cho `ds-admin`; giữ `configure/create` cho root                                                                                                                | 0,25 |
| 21  | Deploy lần đầu dễ gãy                  | `check()` env chỉ gọi `environmentId()`, không kiểm `dataDir` ghi được/`hostDir` tồn tại/DNS; lỗi `EACCES` hoặc cert LE chỉ lộ sau 5 + 3 phút chờ; biến "chỉ lần đầu" mất nếu deploy đầu gãy     | `dokploy-driver.ts:433-447,277-287`, `docs/chenh-lech-upstream.md` §33.1 (mục cuối)                                                                     | S2  | `check()` thử `mkdir`+`writeFile` vào `dataDir`, resolve DNS của mọi `hosts` về IP VPS, báo rõ từng mục                                                                           | 0,5  |
| 22  | Kiểu DB khoá cứng ở lần tạo            | `dbPasswordSealed` chỉ sinh khi tạo row với `database=postgres`; đổi env sqlite→postgres sau đó → `${DB_PASSWORD}` rỗng, Postgres không lên                                                         | `dokploy-driver.ts:304-307,389-393`                                                                                                                      | S3  | Sinh mật khẩu lười khi thiếu ở `apply()`                                                                                                                                         | 0,25 |
| 23  | Đĩa                                    | Mỗi bản deploy giải nén vào `nb3-apps/<name>/<version>` và không bao giờ dọn (chỉ khi purge); `storage/` lại được tar hằng đêm                                                                     | `dokploy-driver.ts:350-351,498-501`, `deploy/dokploy/backup.sh:15`                                                                                       | S3  | Giữ 2 bản/app (bản chạy + 1 để rollback) trong `apply()`                                                                                                                          | 0,25 |

---

## 2. Chi tiết từng luồng

### 2.1 Đăng ký app NB3 **mới** vào Studio

Thứ tự thực tế hôm nay (ghép `docs/xem-thu-app-nb3.md:16-22`, `docs/trien-khai-vps.md:189-197`, mã route):

| Bước | Ở đâu            | Ai           | Việc                                                                                                                                                                                | Có thể tự động? |
| ---- | ---------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1    | Studio UI/CLI    | admin        | `POST /api/projectSetups` (tạo dự án + repo + issue "Khởi tạo"); CI `ds-check.yml` đẩy bằng **token cá nhân** (`project-setups.ts:449-478`)                                             | đã có           |
| 2    | GitHub           | chủ dự án    | Token cá nhân có quyền *Workflows* (`git authorization use-token`) vì GitHub App không có quyền `workflows` (`ci-workflow.ts:14-16`)                                                     | không (GitHub)  |
| 3    | Mắt Bão          | chủ dự án    | Bản ghi A `<app>.dsc.edu.vn` / `<app>-preview.dsc.edu.vn` → `217.15.160.118`                                                                                                             | không           |
| 4    | VPS (ssh root)   | chủ dự án    | Lần đầu: `mkdir storage/nb3-apps && chown 1000` (`trien-khai-vps.md:192`) — đã làm một lần, không lặp                                                                                   | —               |
| 5    | Studio UI (root) | chủ dự án    | Release environments → tạo env driver `dokploy`, **gõ JSON** `{dataDir, hostDir, hosts:{<appId>:<host>}, database, maxApps}` (`trien-khai-vps.md:193-195`)                             | có (form)       |
| 6    | Studio UI (root) | chủ dự án    | Tạo App `<appId>` trong env đó (ds-admin không có `create`, `seeds/202611060002:31-34`)                                                                                                  | có              |
| 7    | Studio API       | admin        | `PUT /api/deploys/repositories/:id/apps/preview` gán App cho repo (hook dừng preview chỉ nhìn `environmentKey==='preview'`, `nb3-apps.ts:184-186`); route này `cliRoute(false)` → không có lệnh CLI, UI ở trang repo | có              |
| 8    | Studio UI (root) | chủ dự án    | Khoá API tổ chức phạm vi **chỉ App đó** (`xem-thu:21`) — làm tay ở Organization keys; route `ci/setup` của Studio lại cấp khoá **mọi App** (`builds.ts:857-862`) và không có UI             | có              |
| 9    | GitHub           | chủ dự án    | Secret `STUDIO_URL`, `STUDIO_API_KEY` (hoặc `DS_STUDIO_API_KEY` theo `builds.ts:51`) của repo                                                                                           | không (GitHub)  |
| 10   | GitHub           | chủ dự án    | Thêm `.github/workflows/preview.yml` (mẫu tay ở `xem-thu:26-63`, **chưa chạy thật** `:65`) hoặc `ds-studio-<app>.yml` sinh bởi `builds.ts:150-186` (chỉ upload, không deploy, `tar` không loại `.bin`/`dist/.env`) | nửa             |
| 11   | Studio UI        | chủ dự án    | Tab Biến của App: `SECRETS_KEYS` v.v. (plugin tự sinh phần `generate`), `INITIAL_ADMIN_*`                                                                                                | đã có           |
| 12   | Studio UI        | chủ dự án    | Deploy lần đầu — "hỏi chủ dự án trước" (`trien-khai-vps.md:196`); chờ ≤ 5 phút Dokploy + ≤ 3 phút healthz                                                                               | đã có           |

Hai workflow "chính thức" lệch nhau: `xem-thu` dùng `/api/releases/apps/$APP_ID/uploadTickets` + `X-Release-Deploy` + `X-Artifact-SHA256`,
còn `workflowOf()` dùng `/api/builds/uploadTickets` với `deploy:false` (`builds.ts:1058-1060`) và `POST /api/builds/deploy` trả
`APP_HOST_OFF` (`builds.ts:1081-1097`). Agent đọc mã sẽ không biết dùng cái nào.

Một nút/playbook khả thi: route `POST /api/nb3Apps/register {repositoryId, appId, host, role, database}` (root) làm bước 5–8 trong một
giao dịch, sinh workflow đúng (một bản duy nhất, có `--exclude`), trả checklist 3 bước còn lại (DNS, secret GitHub, đẩy workflow) kèm nút
"Kiểm DNS" (resolve host ↔ IP VPS). Khoá CI cấp với `objects:[appId]`.

### 2.2 Đăng ký app **đã deploy** (NocoEdu) — có đường nào không?

- **Driver không nhận compose có sẵn.** `ensureRow()` khi chưa có row thì `client().create(name)` compose mới (`dokploy-driver.ts:289-314`);
  mọi thao tác khác đều qua `guarded()` đòi id nằm trong `dsNb3Apps` **và** Dokploy xác nhận tên `nb3-*` trong environment của project
  Studio (`dokploy.ts:171-190`). Compose NocoEdu tạo tay (tên khác, có thể project khác) → không chạm được.
- **Đường "ghi nhận" (record-only):** `PUT /api/repositoryDeployments/:id` tạo App trong env `external` (`builds.ts:646-654`), driver
  `external` từ chối mọi `apply/start/stop` (`server/providers/build-storage.ts:16-21,45-48`). Chỉ để nhận build CI và đánh dấu
  "đã lên production" (`deploys.ts` marks). Không chạy gì.
- **Đường thực tế:** tạo App `nocoedu` mới trong env dokploy → deploy ra compose `nb3-nocoedu` với volume **trống** → tự dump/khôi phục
  DB và chép `storage` từ compose cũ (ssh root) → đổi DNS → xoá compose cũ. Không tài liệu nào mô tả việc này; không có lệnh hỗ trợ.
- **DS-60 ngụ ý gì:** ngay cả khi đã "đăng ký", mục tiêu `pnpm nocobase app edu import-lark --dry-run` vẫn không chạy được vì không có exec
  (2.3). Đăng ký chỉ có ích nếu đi kèm kênh job. Nên tách DS-60 thành (a) kênh job/log, (b) di dời NocoEdu vào compose do Studio quản,
  (c) bí mật Lark theo kênh job. Thứ tự (a) → (c) → (b); (b) có thể hoãn: kênh job có thể chạy trên compose cũ nếu daemon cho phép
  tên compose trong allowlist cấu hình.

### 2.3 Chạy lệnh trong app đã deploy + đọc log

**Có gì:** deploy/rollback/start/stop/restart/remove qua plugin; log **deployment** (sự kiện pha của driver, `dokploy-driver.ts:321-327`)
lưu ở plugin; `GET /apps/:appId/logs` trả rỗng (`available:false`). CLI `ds-studio` chỉ bọc route (`cliRoute`), không có lệnh `app exec`.
Plugin `agents` có khái niệm *Jobs* (`agJobs`: "check out a commit, run an administrator's command, upload its outputs", README plugin agents
dòng 30) — hạ tầng hàng đợi/claim/redaction có sẵn, nhưng job chạy trên **runner** (user 1002, không docker), không chạy trong app.

**Thiếu:** cách đưa một tiến trình vào network/volume của compose `nb3-*` (DB, `storage`, `config.yml`) và lấy stdout về issue.

**So sánh phương án**

| Phương án                                  | Chạy được không?                                                                                   | Bí mật/an toàn                                                                                                               | Nhận xét                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A. Service job một lần trong compose       | Dokploy không có "compose run"; muốn chạy phải `compose.deploy` lại với command khác → restart app | Env `.env` dùng chung với web                                                                                                | Không, trừ khi có ai gọi `docker compose run` trên host                                            |
| B. Dokploy API exec                        | REST không có exec; terminal/log là WebSocket cho phiên đăng nhập trình duyệt (chưa kiểm bản đang cài) | Khoá Dokploy = cả tài khoản (`dokploy.ts:2-3`) → exec qua khoá này = root VPS                                               | Không                                                                                              |
| C. SSH từ "job runner" riêng               | Được: user `studio-jobs` + khoá SSH `command=` ép script allowlist                                 | Khoá SSH nằm ở user runner — trái `trien-khai-vps.md:210`; nếu để ở Studio container thì Studio giữ đường vào root VPS      | Được nhưng lan rộng vùng tin cậy                                                                    |
| D. GitHub Actions job                      | Không tới được DB trong VPS; phải mở SSH ra Internet + secret trong GitHub                         | Xấu nhất về lộ                                                                                                               | Không                                                                                              |
| **E. Daemon host + unix socket (khuyên)**  | Daemon root nhỏ (`/usr/local/sbin/ds-nb3-exec`, systemd) nghe `/run/ds-nb3/exec.sock`; Studio mount socket; nhận `{composeName, cmd ∈ allowlist, args, envFile}`; chạy `docker compose -p <proj> run --rm --no-deps -e JOB=1 --env-file /srv/duongsinh-studio/jobs/<app>.env <svc> node dist/cli/index.js <topic> <cmd> ...`; stream stdout; cũng phục vụ `docker logs --since`/`docker inspect` | Studio **không** có Docker socket; daemon chỉ chạy `node dist/cli/index.js` của chính dist đã mount, không shell, không `-v`, không env ngoài file root:0600; ghi audit `dsNb3Jobs` (ai, lệnh, mã thoát, băm output); output qua redactor của agents | ~150 dòng Go/sh + 1 route + 1 driver method; là "A" làm đúng chỗ                                    |

Khuyến nghị **E**. Về phía Studio: `POST /api/nb3Apps/:appId/jobs {command, args, dryRun}` (quyền `rel.apps operate.all` hoặc root; run
token của agent được phép **chỉ** khi issue có playbook `!nhap-lark` và `dryRun=true`), `GET /jobs/:id/log` (phân trang), driver
`capabilities.logs=true`. Lưu ý dữ liệu học viên: output job không được in bản ghi (chỉ đếm/diff cột) — đưa vào tiêu chí playbook; log job
giữ 14 ngày như run. SQLite: `compose run` song song với app đang ghi → `SQLITE_BUSY`; với app SQLite, job phải `stop` app trước hoặc app
dùng WAL — ghi vào tài liệu.

### 2.4 Bí mật: đường đi và chỗ rò

Đường đi hôm nay: **Biến dự án của agents** (`agSecrets`, niêm phong, giao cho runner lúc claim, redactor che trong sự kiện run — README
agents dòng 36-38) → tách biệt với **Biến env/App của releases** (`relEnvironmentVariables`/`relAppVariables`, niêm phong, resolve lúc
deploy, giao driver `spec.env`) → driver viết **toàn bộ** vào `.env` compose (`nb3ComposeEnv`, `nb3-compose.ts:225-255`) → Dokploy ghi ra
đĩa + DB Dokploy → `env_file` cho service app **duy nhất** (`nb3-compose.ts:171-172`).

| Service nhận                      | Biến                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `nb3-<slug>-app`                  | mọi biến env + App + `DB_PASSWORD` + biến driver đặt (`NODE_ENV, TZ, APP_*, DB_*`)                 |
| `nb3-<slug>-db`                   | chỉ `POSTGRES_*` (`:128-132`)                                                                        |
| `nb3-<slug>-init`                 | không                                                                                                |

Không có cách **giới hạn một bí mật cho job**: chỉ có một service. Với E (2.3), bí mật job ở file host `root:0600`, Studio không bao giờ
giữ giá trị; chủ dự án đặt một lần qua ssh (hoặc daemon có lệnh `set-secret` đọc từ stdin).

Chỗ có thể rò (có/không):

| Chỗ                                         | Rò?            | Bằng chứng                                                                                                      |
| ------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| Log deployment của driver                   | Không          | `emit()` chỉ pha + câu chữ cố định (`dokploy-driver.ts:352,380,410,415`)                                         |
| `lastError`                                 | Thấp           | chứa `message` Dokploy trả (`dokploy.ts:130-133`); Dokploy có thể echo compose? chưa kiểm                        |
| `.env` compose trên đĩa VPS + DB Dokploy    | Có (root đọc)  | `nhat-ky-dot-harness-h.md:41`; chenh-lech §33 mục 4                                                             |
| Mô tả issue/bình luận                       | Một phần       | quét regex `secret-patterns.ts:20-85`; thiếu `LARK_APP_SECRET`, `DB_PASSWORD`, `SECRETS_KEYS`, khoá Studio/Dokploy |
| Diff PR                                     | Một phần       | `scanAddedLines` cùng regex; CI `ds-check.yml` chỉ chặn tên file (`ci-workflow.ts:55-57`)                        |
| Sự kiện run trên runner                     | Thấp           | redactor che biến đã giao + mẫu chung (README agents dòng 36)                                                    |
| Phiên làm việc của agent/chat               | **Đã xảy ra**  | in khoá API cá nhân và ticket (`nhat-ky-m2-m4-2:73-75`)                                                          |
| Khoá CI phạm vi rộng                        | Có             | `builds.ts:857-862`: write mọi App, 365 ngày                                                                      |
| Khoá Dokploy toàn tài khoản trong Studio    | Có             | `dokploy.ts:1-7`; hẹp bằng allowlist mã, không bằng quyền                                                        |
| Backup `storage-<ngày>.tar.gz`              | Có             | chứa `storage/releases` (config đã deploy, mode 0600 nhưng tar giữ) — `backup.sh:15`; `umask 077` nên file dump 0600 |

### 2.5 Lark

- Repo chỉ nhắc Lark ở: domain `open.larksuite.com` trong allowlist **đề xuất** (`server/runner/service.ts:50-54`,
  `docs/runner-resource-limits-proposal.md:32`; hôm nay runner **chưa** bị giới hạn mạng — `:16`), playbook `!nhap-lark`
  (`definitions.ts:88-127`), và 0.0.0.0 cho preview NB2 (`server/previews/compose.ts:30`).
- `lark-cli` (plugin Cowork `seahyc/lark-cli`, thấy ở máy này) cài bằng `git clone && make install` (cần Go, module proxy — không trong
  allowlist), cấu hình `.lark/config.yaml` (App ID), bí mật qua `LARK_APP_SECRET` env, đăng nhập **OAuth người dùng mở trình duyệt**
  `http://localhost:9999/callback`, scope bitable chỉ `bitable:app:readonly`. Trên runner headless user `studio-runner` (cấm giữ token,
  `trien-khai-vps.md:210`) không làm được và không nên.
- Cách đúng cho import: lệnh `import-lark` của nocoedu gọi Lark Open API bằng **tenant_access_token** (app id/secret), chạy trong app
  (kênh E), bí mật từ file job. Agent chỉ gọi `ds-studio nb3 job run edu import-lark --dry-run` và đọc log; không cần lark-cli.
- Giới hạn Lark Bitable (tài liệu open.larksuite.com, bitable-v1): mỗi lần list tối đa 500 bản ghi, batch create/update ≤ 500/lần và
  "cả gói thành công hoặc thất bại", khuyến nghị **một** lệnh ghi tại một thời điểm trên cùng một Base; QPS cụ thể nằm ở trang "频控策略"
  riêng (chưa tra). Playbook nên ghi: phân trang 500, ghi tuần tự, retry 429 với backoff.
- Thiếu: tài liệu "Lark cho DSC" (app Lark nào, scope, ai giữ secret, bảng nguồn), và `tests/server/lark-sync.test.ts` mà playbook đòi.

### 2.6 `maxApps` / RAM / tự dừng

- `capacityProblem()` đếm `otherRunning` trên **mọi** row `dsNb3Apps` (`:244-248`) rồi so với `settings.maxApps` của env **đang** deploy
  (`:252`). Ví dụ: env `nocolms` (`maxApps 1`) có app chạy → deploy vào env `preview` (`maxApps 1`) bị từ chối với lý do nêu tên
  `nocolms`. Với NocoEdu production + NocoLMS production + 1 preview: trần cứng `maxApps ≤ 2` (`:124,160`) **không đủ** dù RAM có.
- Không cổng RAM: preview NB2 có `MIN_AVAILABLE_MB=1200` + `MAX_PRODUCTION_MS=3000` (`previews/service.ts:34-36`), driver NB3 không có.
  Đo M4.1: khả dụng ≈ 3,0 GiB, còn ≈ 0,5 GiB khi runner chạy nặng, swap đã dùng 8,6/16 GiB (`m4-1-do-dac-vps.md:13-15,32-37`).
  Mỗi app: `mem_limit 1g` (+ `384m` Postgres) (`nb3-compose.ts:186-187,135`); Studio `1536m` (`deploy/dokploy/docker-compose.yml:67`);
  runner `2,5 GiB` (`runner/service.ts:10-14`).
- Tự dừng: `sweepIdle` dừng khi `startedAt + idleStopMinutes` qua (`:559-563`) — không phải "không dùng"; `start()` giữ
  `idleStopMinutes` nên bật tay rồi lại tắt; nếu lỡ đặt policy này cho app production thì production tắt sau 30 phút. Sweep chỉ chạy khi
  `DOKPLOY_*` có (`nb3-apps.ts:216`).
- `status()` không hỏi Dokploy (`:507-526`): container OOM/crash vẫn `running` trong UI, và vẫn **chiếm** suất `maxApps`.
- UI: trang `/environments` (Studio) hiện seed NB2 cũ (preview `maxApps 2`, `pr-{number}.preview`, mô tả "NocoBase 2 dựng tạm") —
  `seeds/202611060001_ds_environments.ts:21-64`; trang env của plugin: `check.details = {database, maxApps}` (`:439`). Không nơi nào hiện
  RAM. `GET /api/runner/recommendations` không có client; `estimatedPeakMemoryMb: 1850` là hằng (`runner/service.ts:113-114`).

### 2.7 Sao lưu / quay lui DB app

- Có: `deploy/dokploy/backup.sh` (cron 03:15) dump **DB Studio** + tar **`storage/` của Studio**; khôi phục Studio có hướng dẫn
  (`trien-khai-vps.md:93-120`); đã thử khôi phục 07/11; chưa đẩy ra ngoài VPS (`:102-105`, `harness-h:91`).
- Không có: dump cho `nb3-*-db` (volume `pgdata`) hay chép volume `storage` (SQLite ở đó) — `backup.sh:10` lọc đúng
  `com.docker.compose.project=duongsinh-studio-tluxoy`. `remove(purgeData)` gọi `compose.delete deleteVolumes:true`
  (`dokploy-driver.ts:494-497`, `dokploy.ts:243-245`) không chụp gì trước. Plugin `rollback` chỉ đổi bản `dist`; migration của app
  không có `down` tự động → quay lui sau migration cần dump trước đó, vốn không có.
- Tài liệu: không trang nào nói sao lưu/khôi phục app NB3; playbook `!deploy-dokploy` bước 1 "tạo backup" không chỉ cách
  (`definitions.ts:137`).

### 2.8 Tài liệu lệch mã (10 kiểm)

| #   | Tài liệu nói                                                                            | Mã/thực tế                                                                                                   | Vị trí                                                                                                  |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1   | "trang tài khoản chưa có giao diện tạo khoá, xem M2.3"                                  | Đã có `api-keys-card.tsx` (`client.apiKey.create`)                                                           | `docs/trien-khai-vps.md:127` ↔ `client/pages/settings/my-account/api-keys-card.tsx:98`                 |
| 2   | GitHub App cài "Only select repositories" cho 2 repo                                    | Đã cấp "All repositories"                                                                                    | `docs/trien-khai-vps.md:143` ↔ `docs/plans/2026-11-09-nhat-ky-m2-m4-2-nocolms.md:33`                    |
| 3   | "Tính đến 07/11 cron chưa chạy lần nào … kiểm backup.log"                               | Không cập nhật sau 08/11; nhật ký 12/11 chỉ nói rclone chưa bật                                             | `docs/trien-khai-vps.md:98-99` ↔ `docs/plans/2026-11-12-nhat-ky-dot-harness-h.md:91`                    |
| 4   | "tự dừng sau 30 phút **không dùng**"                                                    | Dừng 30 phút **sau khi bật** (chenh-lech §33 mục 1 ghi đúng)                                                 | `docs/trien-khai-vps.md:186`, `docs/xem-thu-app-nb3.md:4` ↔ `dokploy-driver.ts:559-563`                 |
| 5   | Preview = 1 App cố định/repo, `maxApps 1`, không wildcard                              | Seed `dsEnvironments` + trang `/environments`: preview `maxApps 2`, `pr-{number}.preview…`, mô tả NB2       | `docs/xem-thu-app-nb3.md:3-5` ↔ `database/main/seeds/202611060001_ds_environments.ts:22-34`             |
| 6   | "Khoá API có phạm vi chỉ App xem thử (`upload`+`deploy`)"                              | Route cấp khoá CI của Studio cấp `releases.apps write` mọi App; tài liệu không nói tạo khoá hẹp ở đâu        | `docs/xem-thu-app-nb3.md:21` ↔ `server/routes/builds.ts:857-862`                                        |
| 7   | Workflow mẫu gọi `/api/releases/apps/…/uploadTickets` + deploy                          | Workflow Studio sinh gọi `/api/builds/uploadTickets`, không deploy; `builds/deploy` trả `APP_HOST_OFF`; mẫu "chưa kiểm trên GitHub thật" | `docs/xem-thu-app-nb3.md:53-66` ↔ `server/routes/builds.ts:150-186,1081-1097`                           |
| 8   | `cli/commands/` "Commands this application owns"                                        | Thư mục không tồn tại (`cli/` chỉ có `plugins.ts`)                                                           | `AGENTS.md` mục "Where things go" ↔ `ls cli`                                                            |
| 9   | "Its App Hosts stay disabled until release environments are built"                      | Đã có driver `dokploy` + env `external` (`build-storage.ts`); rule không nhắc                                | `.agents/rules/duongsinh-studio.md:92-93` ↔ `server/providers/nb3-apps.ts`, `build-storage.ts:10-21`    |
| 10  | Playbook `!deploy-dokploy`: "tạo backup", "theo dõi log container", "rollback về backup" | Không có backup app, không có log, rollback chỉ đổi `dist`; tiêu chí `pnpm build` trái luật runner           | `server/playbooks/definitions.ts:134-167` ↔ `.agents/rules/duongsinh-studio.md:120-122`, 2.3, 2.7       |
| 11  | Runner cần "SSH cổng 22" tới GitHub                                                     | Run dùng token GitHub App qua HTTPS (1 giờ)                                                                   | `docs/runner-resource-limits-proposal.md:30` ↔ `docs/trien-khai-vps.md:134-135`                         |
| 12  | `moi-truong-dev.md` "Cập nhật 01/11 (S0)" mô tả runner cá nhân đang dùng                 | `trien-khai-vps.md:213-214`: runner cá nhân "hiện đang dừng (VPS lo việc)"                                   | `docs/moi-truong-dev.md:3,29-46`                                                                        |

### 2.9 Hai bản checkout (Orca `D:\code` + WSL `~/code`)

Mô hình hôm nay: WSL là nơi chạy/build (`moi-truong-dev.md:13`), Windows là "mirror bằng git" (`:14`), build production **bắt buộc** WSL
(`.agents/rules/duongsinh-studio.md:86-88`, `harness-h:78-83`).

Cách gãy đã thấy/đoán được:

1. CRLF: clone bằng `gh.exe` → CRLF (`nhat-ky-m2-m4-2:79`); repo **không có** `.gitattributes`; CI `format:check` (prettier mặc định
   `endOfLine: lf`) đỏ, diff nhiễu.
2. Build ở Windows: thiếu `@napi-rs/canvas-linux-x64-gnu`, `sqlite-vec-linux-x64` (`harness-h:79`) → container `ERR_MODULE_NOT_FOUND` sau
   khi đã deploy (giống lỗi ở `nhat-ky-m2-m4-2:50-52`).
3. Hai working tree lệch commit: build từ sha chưa push/khác `origin/main`; `STUDIO_RELEASE=<sha>` không truy được về PR.
4. `node_modules` của hai bên khác hệ điều hành; symlink từng bị commit (`duongsinh-studio.md:131-134`).
5. `.env`/`config.yml` untracked mỗi bên một bản; bí mật production chỉ ở WSL `~/code/secrets` (`trien-khai-vps.md:21`).
6. Quoting `wsl -d Ubuntu -- bash -c "…"` và heredoc qua PowerShell hỏng (`moi-truong-dev.md:81-82`).
7. Build cần ≥ 6 GB RAM, Rollup wasm (`moi-truong-dev.md:69-77`).
8. `/mnt/d` I/O chậm nếu lỡ `pnpm install` ở đó (`:13`).

**Một quy trình khuyên dùng:** chỉ một working tree ở WSL `~/code/duongsinh-studio`; Orca mở thư mục qua
`\\wsl.localhost\Ubuntu\home\duongsinh\code\duongsinh-studio`; xoá `D:\code\duongsinh-studio` hoặc giữ làm bản chỉ đọc không bao giờ
commit; thêm `.gitattributes` (`* text=auto eol=lf`) + `git config core.autocrlf false` ở Windows; **release không build ở máy dev**:
GitHub Actions trên tag `v*` chạy `pnpm build --target linux-x64 --node-version 24 && pnpm nocobase dist check` rồi upload tarball làm
Release asset; trên VPS một script `deploy/dokploy/release.sh <sha>` tải, giải nén, chown, đổi `STUDIO_RELEASE`, dọn còn 3 bản. Máy dev chỉ
còn `git tag`. Cho tới khi có CI build, thêm kiểm tra ở script build: từ chối nếu `uname -s != Linux` hoặc `git status --porcelain` khác
rỗng hoặc `HEAD != origin/main`.

### 2.10 Quan sát: "vì sao việc này chậm"

| Câu hỏi                                   | Có?                | Ở đâu                                                                                                                  |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Run chờ bao lâu trước khi chạy            | Chỉ khi còn queued | `issue-runs.tsx:55-66`: hết queued thì chỉ hiện thời lượng từ `startedAt`; `createdAt/startedAt` có trong API (`issue-work.ts:607-609`) nhưng UI không trừ |
| Vì sao run đang chờ                       | Có                 | `GET /agentBoard/issues/:issueId/agents/:agentId/wait` (`issue-work.ts:954-957`), trang Agent queue nhóm `waiting/working/queued/idle` (`agent-queue.tsx:15`) |
| Hàng đợi runner (slot, online)            | Có (API)           | `runs.workload` của plugin agents (README dòng 35); UI chỉ qua Agent queue                                              |
| Thời lượng CI                             | Không              | `dsReportedChecks` chỉ `reportedAt` (`202611100003:11-22`); `dsPullRequests.checks` JSON trạng thái                   |
| Timeline theo issue                       | Không              | Có rời rạc: `agRuns`, `dsPullRequests`, `dsVerifications`, `dsReviews`, `dsDeploymentRecords`; không trang ghép        |
| Cycle time                                | Tổng p50           | `reports/service.ts:129-149`                                                                                           |
| RAM/CPU runner lúc run                    | Không              | `runner/service.ts:113-114` hằng 1850 MB; không đọc `systemd-cgtop`/`memory.peak`                                       |
| Số liệu thời lượng run                    | Có                 | trung vị/P95 20 run gần nhất (`runner/service.ts:72-116`), không có UI                                                  |

Việc "Khởi tạo dự án" chạy ~2 giờ chặn deploy Studio (`nhat-ky-m2-m4-2:29-30`) là ví dụ: không có chỗ nào thấy trước run đó sẽ dài.

---

## 3. Top-10 xếp hạng (theo giá trị / rủi ro ÷ công)

1. **Kênh job + log cho app NB3 (E ở 2.3)** — mở khoá DS-60, mọi import/migration/seed, và `logs()`/`status()` thật. S1, ~4 ngày + 0,5
   ngày chủ dự án cài daemon.
2. **Sao lưu volume `nb3-*` + dump trước purge/deploy production** — dữ liệu học viên (trẻ em) hiện không có bản sao. S1, 1 ngày.
3. **Khoá CI theo App + hạn 90 ngày** (`builds.ts:857-862`) — một khoá rò là mất mọi App. S1, 0,5 ngày.
4. **Ngân sách RAM thay `maxApps` toàn cục + `status()` hỏi Docker** — tránh production chặn preview và "running ma". S1, 1,5 ngày.
5. **Bí mật job tách khỏi `.env` app + mở rộng regex quét** (`LARK_APP_SECRET`, `DB_PASSWORD`, khoá Studio/Dokploy). S1, 1 ngày.
6. **Playbook "Nối app NB3"** gom bước 5–8 + sinh một workflow duy nhất đã kiểm trên GitHub thật. S2, 3 ngày.
7. **Release Studio qua GitHub Actions + `release.sh`**; một checkout WSL; `.gitattributes`. S2, 2,5 ngày.
8. **Timeline theo issue + lưu thời lượng check** — trả lời "vì sao chậm". S2, 2 ngày.
9. **Sửa seed `dsEnvironments`/trang `/environments` cho đúng mô hình NB3** và 12 điểm lệch tài liệu (2.8). S2, 1 ngày.
10. **Rà 4 playbook** (lệnh không tồn tại, tiêu chí trái luật runner) + test chặn. S2, 0,5 ngày.

Việc rẻ nên làm kèm: `ds-admin` thêm `operate.all` (0,25); `check()` env kiểm `dataDir`/DNS (0,5); sinh `DB_PASSWORD` lười (0,25);
giữ 2 bản dist/app (0,25); đổi chữ "tự dừng" (0,25).

## 4. Không nên làm

- **Không** mount Docker socket vào container Studio hay thêm `studio-runner` vào nhóm `docker`: tương đương root trên VPS đang chạy
  production NB2 (`docs/chenh-lech-upstream.md` §33 câu đầu; `trien-khai-vps.md:203-205`). Daemon E giữ root ở một tiến trình 150 dòng có
  allowlist, không ở Studio hay agent.
- **Không** cho exec qua khoá Dokploy hiện có (khoá toàn tài khoản, `dokploy.ts:1-7`).
- **Không** đặt `LARK_APP_SECRET` (hay bất kỳ bí mật tích hợp) vào tab Biến của App/env: nó vào container web và `.env` trên đĩa.
- **Không** cài `lark-cli` hay giữ token Lark/SSH/Dokploy trong user `studio-runner` (`trien-khai-vps.md:210`).
- **Không** nâng `maxApps` hay thêm app bằng cách sửa trần 2 → 3 mà chưa có cổng RAM; VPS đã dùng 8,6 GiB swap (`m4-1:15`).
- **Không** đặt `idleStopMinutes` cho App production (tắt sau N phút kể từ lúc bật).
- **Không** để playbook/tiêu chí chạy `pnpm build|check|test|typecheck` toàn repo trên runner dùng chung (`duongsinh-studio.md:120-122`).
- **Không** build release ở Windows hay copy `dist` từ `D:\` (`harness-h:78-83`).
- **Không** `DELETE App` (purge) trước khi có dump: xoá volume ngay (`dokploy-driver.ts:494-497`).
- **Không** cấp khoá CI bằng `ci/setup` hiện tại cho repo có App production cho tới khi sửa phạm vi.
- **Không** in khoá/ticket ra phiên chat (đã xảy ra, `nhat-ky-m2-m4-2:73-75`); đọc vào biến, dùng `--api-key-stdin`.

## 5. Chưa kiểm được từ đây (cần VPS/Dokploy thật)

- Bản Dokploy đang cài có endpoint WebSocket terminal/log và cơ chế xác thực của nó; có cho tạo API key giới hạn project không.
- Quyền file `/etc/dokploy/compose/nb3-*/code/.env` (0600 hay 0644).
- `relReleases`/`release-artifacts` có vòng dọn không (đĩa `storage/` lớn dần → backup lớn dần).
- NocoEdu production hiện ở compose nào, project nào, DB gì — không có trong tài liệu repo.
- QPS thực của Lark Bitable (trang 频控策略).
