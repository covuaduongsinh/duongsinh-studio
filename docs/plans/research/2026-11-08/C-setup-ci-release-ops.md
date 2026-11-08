# Rà soát chênh lệch tính năng — nhóm C: cài đặt, Git, CI/checks, phát hành, vận hành

Ngày rà soát: 08/11/2026. Chỉ đọc, không sửa repo. Repo: `/home/claude/duongsinh-studio` (`main`, commit mới nhất `b898aa8`).
Tài liệu nguồn: `/mnt/user-data/uploads/nocobase studio/` — `02-general/02-studio.md`, `05-studio/05,06,07,08,09,10,11,34,35,36,37,38,39,40,41,45,49,50,51`.

**Giới hạn của nguồn:** `37-previews.md` và `50-storage.md` được scrape **rỗng** (chỉ có tiêu đề / "## 0 1"). Hành vi PR preview
và storage nên lấy từ các trang khác (`11-ci`, `34-checks`, `38-environments`, `49-config`, `51-faq`). Bảng "Troubleshooting" của
`06-install.md` có trong file gốc (dòng 322–329) nhưng không có tính năng nào mới.

Ký hiệu trạng thái: **Có** · **Một phần** · **Chưa có** · **Cố ý khác** (đã có quyết định ghi trong `docs/`).

## Bối cảnh cần biết trước khi đọc bảng

- DS Studio **không chạy app nào** cho người dùng. Plugin `releases` được nối với driver giả `external` chỉ lưu và từ chối mọi lần
  chạy (`server/providers/build-storage.ts:13-24`); `POST /api/builds/deploy` luôn trả 400 `APP_HOST_OFF`
  (`server/routes/builds.ts:1081-1096`). Quyết định Q5 ngày 07/11: "có route, chưa bật Host", vì VPS chỉ còn khoảng 3 GB RAM
  (`docs/chenh-lech-upstream.md:552`).
- Preview và staging hiện có (S5.6) chỉ dành cho **một repo NocoBase 2** (`duongsinh-nocobase`): compose Dokploy dùng image
  `nocobase/nocobase:2.2.36-full` + container setup chạy `setup/run.mjs all` và cài plugin `@duongsinh/*`
  (`server/previews/compose.ts:1-19,148`). **App NocoBase 3 (như `nocofen`) không có đường preview, staging hay deploy nào.**
  Đây là khoảng trống lớn nhất so với mục tiêu "khoảng 6 app NocoBase 3 cần preview → production".
- Plugin `releases` **đã có sẵn** phần lớn những gì tài liệu mô tả (App, môi trường có `maxApps`, `idleStopMinutes`, dormancy,
  Variables theo App và theo môi trường, `VARIABLES_MISSING`, protected environment + request/approve, rollback, log) và cho phép
  đăng ký **driver tuỳ ý** (`releasesDriversToken`, interface `DeploymentDriver` ở
  `node_modules/@nocobase/app-plugin-releases/dist/server/drivers/types.d.ts:48,168`). Trang của plugin đã được route ở `/apps` và
  `/release-environments` (`client/plugins.ts:51`). Chỉ thiếu một driver chạy thật.

## Bảng tính năng

### A. Cài đặt và cấu hình (`05-setup`, `06-install`, `49-config`, `50-storage`)

| Tính năng (file docs) | Docs nói gì (1 dòng) | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Triển khai bằng image + Docker Compose (06) | Image thương mại, `docker compose up`, Postgres 16, UID 1000 ghi `storage` | Cố ý khác | `deploy/dokploy/docker-compose.yml:9-16` (image `node:24.15.0-bookworm-slim` chạy `dist/server/standalone.js`, user 1000:1000); `docs/trien-khai-vps.md:10-21` | Bản phát hành build trên máy dev rồi `scp`, chọn bằng `STUDIO_RELEASE`. Không có image riêng |
| Lấy `config.example.yml` từ image (06, 49) | `docker run … cat /app/config.example.yml` | Có (khác cách) | `config.example.yml` ở gốc repo, được đóng gói kèm `dist` (`docs/trien-khai-vps.md:35`); cấu hình chạy là `deploy/dokploy/config.yml` | |
| **Tắt tự đăng ký** `auth.emailAndPassword.disableSignUp: true` (06, 49) | Bước bắt buộc; "Done when… trang đăng nhập không có link đăng ký" | **Chưa có** | `deploy/dokploy/config.yml:17-19` chỉ có `enabled: true`, `autoSignIn: false`; `server/config/auth.ts:32` mặc định không có `disableSignUp`; `client/pages/auth/login.tsx:42-45` hiện link `/register` khi `signUpAvailable`; `tests/server/member-role.test.ts:165-190` chứng minh `POST /auth/sign-up/email` tạo được user và gán vai trò `member` | **Chưa kiểm trên production đang chạy** (không có quyền truy cập). Theo mã thì ai có URL cũng tự tạo được tài khoản. Lời mời đi đường riêng `/api/users/invitations/accept` (README của `app-plugin-users`, dòng 72), nên tắt sign-up không làm hỏng lời mời |
| Biến khởi tạo admin `INITIAL_ADMIN_*` (06, 49) | Chỉ dùng ở lần cài đầu | Có | `deploy/dokploy/docker-compose.yml:33-35`; `docs/trien-khai-vps.md:23-26` | |
| `SECRETS_KEYS` / khoá mã hoá, xoay khoá `2:new,1:old` (06, 49) | Giữ khoá, sao lưu cùng DB; xoay bằng thêm phiên bản mới | Có | `docker-compose.yml:32`; `config.example.yml` mục `secrets` (`pnpm nocobase secrets rotate`); bản sao ở `~/code/secrets/studio-prod.secret` (`trien-khai-vps.md:21`) | Chưa từng xoay; chưa có bản sao ngoài VPS/dev được xác nhận (K0.3 bước 4) |
| `APP_PUBLIC_ORIGIN` (06, 49) | Địa chỉ công khai, dùng cho callback, email, push | Có | `docker-compose.yml:26`; webhook App lấy từ đây (`chenh-lech-upstream.md:335-336`) | |
| HTTPS reverse proxy có WebSocket (06) | Caddy/HTTPS + WebSocket | Có (khác cách) | Traefik của Dokploy, router riêng cho `/main/ws` ép `X-Forwarded-Proto=https` (`docker-compose.yml:53-62`) | |
| `healthz` (06) | `curl …/main/api/healthz` trả `ok: true` | Có | healthcheck ở `docker-compose.yml:65-70` | `healthz` không trả phiên bản đang chạy; phải đọc mount (`2026-11-07-studio-khac-phuc-ton-dong.md:37`) |
| Lưu tệp local, persist `storage` (06, 49) | `drive.default` local, mount `/app/storage` | Có | `server/config/drive.ts:8-13`; mount `/srv/duongsinh-studio/storage` (`docker-compose.yml:52`) | |
| Object storage S3 cho tệp (06, 49, 50) | `drive.disks.s3`, bucket private | Một phần | Disk `s3` khai sẵn nhưng `bucket: ''` (`server/config/drive.ts:14-22`), `default: 'local'` | Đủ dùng; S3 không cần cho quy mô hiện tại |
| `releases.artifact` tách khỏi disk mặc định (06, 49) | Artifact CI/Agent lưu riêng | Có | `server/config/releases.ts:10-14` (`disk: 'local'`, prefix `release-artifacts`) | |
| Email lời mời + đặt lại mật khẩu qua `mailers` SMTP/Resend, `MAILERS_SYSTEM_*` (06, 49) | Cấu hình SMTP trước khi mời nhóm; `auth.passwordReset.enabled` | Chưa có (đã có chỗ cắm) | `server/config/mailers.ts:8-11` mặc định rỗng; compose không truyền `MAILERS_SYSTEM_*`; `config.example.yml` mục `auth` để `passwordReset` dạng chú thích | Email **thông báo** đi kênh riêng `studio-email`, vẫn tắt (`STUDIO_EMAIL_ENABLED=false`, `docker-compose.yml:44`; `chenh-lech-upstream.md:559-563`). Lời mời hiện phải chép link tay |
| Checklist sau cài (06) | Thử tải tệp lên/xuống, nhận lời mời qua email, đặt lại mật khẩu | Một phần | Tải bản build lên/xuống đã thử (mục 7 U7 của `2026-11-06-…-cap-nhat.md:327`); email và reset chưa có | |
| `i18n.defaultLocale` (49) | Đổi ngôn ngữ giao diện | Có | `deploy/dokploy/config.yml:5-6` (`vi-VN`) | |
| `notification.channels`, `push` (49) | Kênh in-app/email, web push | Có | `deploy/dokploy/config.yml` (`inbox`), `server/config/notification.ts:18-45`, `WEB_PUSH_PRIVATE_KEY` (`docker-compose.yml:42`) | Push có khoá VAPID, chưa thiết bị nào đăng ký (K-plan 1.4) |
| `logging` (49) | Mức log, số ngày, dung lượng giữ | Có | `server/config/logging.ts:10-17` (7 ngày, tối đa 500 MB) | |
| `API_BODY_LIMIT`, `API_TIMEOUT` (49) | Giới hạn request API | Có | `config.example.yml` mục `api` (template) | |
| `agents.runs.retentionDays` (49) | Giữ transcript 14 ngày | Có | Mặc định 14 của plugin, không khai (`trien-khai-vps.md:60-61`) | |
| `studio.agents.queuedExpiryHours` (49) | Việc xếp hàng chờ runtime quá 24 giờ thì fail | **Chưa có** | Plugin hỗ trợ `queuedExpiryMs` trên subject binding (`app-plugin-agents/README.md:167`, `dist/server/core/runs/sweeper.js:222`); `grep -rn queuedExpiryMs server` không có kết quả, nên run của subject `issue` chờ mãi | Việc nhỏ |
| `studio.git.apiBaseUrls` (GHES/GitLab tự host) (49) | Địa chỉ API Git tự host | Một phần (khác dạng) | `apiBaseUrl` theo từng kết nối (`server/routes/git.ts:144,373`), không có khoá cấu hình chung | Chỉ dùng GitHub.com, không cần |
| `studio.testing.enabled` (49) | Hiện menu Quality management | Chưa có | Không tìm thấy `testing.enabled`/`STUDIO_TESTING` trong `server/`; kế hoạch 06/11 mục 2 để "menu Testing" ngoài phạm vi | Thuộc nhóm tài liệu khác (quality), chỉ ghi ở đây vì là tuỳ chọn cấu hình |
| Nhiều instance với Redis cho `realtime`, `jobs` (49) | Bắt buộc khi chạy nhiều instance | Cố ý khác | `deploy/dokploy/config.yml` cuối file: `jobs.default: memory`, `queue.default: memory` | Một tiến trình duy nhất |
| `releases.docker`, `releases.host.launchPrefix`, `studio.releases.previewPublicUrl`, `previewEnvironment` (49) | Docker mode cho app thử; preview chạy user khác, domain riêng | Cố ý khác | App Host tắt (`server/config/releases.ts:7-9`, `build-storage.ts`); preview NB2 chạy trong compose Dokploy riêng ở `preview.dsc.edu.vn` (`chenh-lech-upstream.md:419`) | Mục tiêu an toàn (preview không đọc được bí mật Studio) đạt bằng container riêng |

### B. Kết nối Git (`07-git`, `41-git`)

| Tính năng (file docs) | Docs nói gì | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Tạo GitHub App từ Studio (manifest), chọn tài khoản hoặc organization (07) | Settings › Integrations › Git › Add connection › GitHub | Có | `POST /git/connections/startAppManifest` + `appManifest/complete` (`server/routes/git.ts:785-850`); `manifestPostUrl` có nhánh organization (`server/git/github-app.ts:66-76`) | Hướng dẫn chủ dự án: `trien-khai-vps.md:106-126` |
| Bật/tắt Webhook khi tạo App, tắt thì poll (07, 41) | Lựa chọn Webhook; mạng riêng thì tắt | Một phần | Manifest luôn `hook_attributes.active: true` (`github-app.ts:50-53`), không có công tắc; poll 60 s, giãn ra 600 s khi webhook chạy (`server/git/service.ts:83,383`) | Studio có HTTPS công khai nên không cần công tắc |
| Thẻ kết nối: Connected, số repo truy cập được, trạng thái webhook (07, 41) | Thẻ hiện Connected + số repo | Một phần | Thẻ App hiện "Installed on…", quyền thiếu, lần nhận webhook cuối (`client/pages/settings/git.tsx:204-250`); không hiện số repo | |
| Repository access All / Only select (07, 41) | All repos để Studio tạo repo mới | Có (trên GitHub) | Hướng dẫn hiện chọn "Only select" (`trien-khai-vps.md:117`); repo mới tạo mà App chưa với tới trả `GIT_REPOSITORY_NOT_INSTALLED` (`chenh-lech-upstream.md:580-581`) | Muốn `newRepo` chạy trơn thì phải chuyển App sang All repositories |
| Nhập cấu hình GitHub App có sẵn bằng tay (41) | Dùng App đã tạo trước | Chưa có | `CreateConnectionBody` chỉ nhận `kind: 'token'` (`server/routes/git.ts:364-367`); App chỉ tạo được qua manifest | Không cần |
| "Add installation" — nhiều installation của một App (41) | Cài App lên tài khoản/org khác | Chưa có | Bảng `dsGitApps` có một cột `installationId` (`database/main/migrations/*ds_git_apps*:19`) | Chỉ một tài khoản `covuaduongsinh` |
| GitHub Enterprise Server (41) | Hỗ trợ GHES | Một phần | `apiBaseUrl` theo kết nối (`git.ts:144,373`) | Không cần |
| GitLab (group token, MR, pipeline) (41) | Kết nối GitLab | Chưa có | `grep -rn "gitlab\|GitLab" server client/pages` không có kết quả | Không cần |
| Kết nối PAT song song | (không có trong docs, DS thêm) | — | `kind: 'token'` (`chenh-lech-upstream.md:328-330`) | |
| Ủy quyền Git cá nhân của thành viên (41, 51) | OAuth/thiết bị để commit đứng tên người | Một phần | Chỉ `authorizations/:id/useToken` (`git.ts:1509`); OAuth/device flow hoãn (`chenh-lech-upstream.md:547`) | Cần token cá nhân cho `newRepo` trên tài khoản User và cho nút "Thêm CI"; production đang 0 dòng (`2026-11-08-…-pr6.md:122`) |
| Nhắc cập nhật credential sắp hết hạn (41) | Cập nhật credential trước khi hết hạn | Chưa có | Không tìm thấy job nhắc hạn cho kết nối/khoá (`grep expir` + `notify` trong `server/` không giao nhau) | |

### C. Runtime và Agent (`08-shared-runtimes`, `09-agents`, `45`)

| Tính năng (file docs) | Docs nói gì | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Add runtime (shared), chọn công cụ, concurrency, lệnh cài theo HĐH, credential dùng một lần (08) | Agent management › Runtimes | Có (plugin) | `runtimesRoute` của `app-plugin-agents` (`client/routes.ts:371-391`); registration token một lần (`app-plugin-agents/README.md:24`) | |
| Runtime Online, công cụ "Signed in" (08) | Kiểm tra trạng thái | Có (plugin) | Runner `vps-studio-runner` online, beta.23 (`2026-11-07-…:40`) | |
| Runtime tách biệt Studio (container/VM riêng) (05, 08) | Khuyến nghị container/VM riêng | Một phần (cố ý) | Runner là user hệ thống `studio-runner` trên **cùng VPS**, không sudo, không nhóm docker, giới hạn slice 2,5 GiB/300 % CPU (`trien-khai-vps.md:159-166`) | Hợp lý với một VPS; ranh giới kém hơn VM |
| Agent tự sinh theo công cụ × model, "Where it runs" (09) | Model phổ biến tự thêm và bật | Có (plugin) | `agentsRoute` (`client/routes.ts:371-375`) | |
| Lead Agent: First choice + Fallback (09) | Trang Settings của Lead Agent | Một phần | `GET/PATCH /api/projectManager` có `firstChoiceAgentId`, `fallbackAgentId`, `fallbackAfterSeconds` (`server/routes/project-manager.ts:43-48,173-174`); không tìm thấy trang client gọi route này (grep `projectManager` trong `client/` chỉ ra `hooks/use-issue-work.ts:282` cho `/start`); `fallbackAfterSeconds` chỉ được lưu (`chenh-lech-upstream.md:123-126`) | Đổi qua API/CLI |
| Runner và CLI tự cập nhật; `update`; trang runtime báo phiên bản không tương thích (45) | `nocobase-runner update`, `nb-studio update` | Có (plugin) + quy trình tay | `upgrade_required` (`app-plugin-agents/README.md:24`); `selfUpdate` (`app-cli-client/README.md:31`); runner VPS nâng bằng chép `storage/runners/dist` (`trien-khai-vps.md:167`) | |

### D. Tạo dự án (`10-new-project`)

| Tính năng (file docs) | Docs nói gì | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| New project + New repository (private) + NocoBase app template mặc định (10) | Một bước tạo repo, khởi tạo mã | Có (chưa có ca thật) | `POST /projectSetups` (`server/routes/project-setups.ts:307`), template ghim phiên bản (`server/setups/template-version.ts`), chỉ `default` (`project-setups.ts:75`); trang `client/pages/projects/setup.tsx` | Production: `ds_project_setups` = 0, `ds_git_authorizations` = 0 (`2026-11-08-…-pr6.md:122`), nên `newRepo` trên tài khoản User chưa chạy được |
| Task "Initialize project" do Lead Agent giao (10) | Agent tạo app, cài, commit lên nhánh mặc định | Có | Issue khởi tạo + skill ngoại lệ commit mốc gốc (`2026-11-07-…:190-203`) | |
| Các task khác chờ khởi tạo xong; overview nhắc hoàn tất khởi tạo (10) | Chặn việc khác cho tới khi init xong | Chưa có | `grep setupIssueId\|initialization server` ngoài `project-setups.ts` không có kết quả; trang project không gọi `projectSetups` | Tự lái có thể mở việc khác khi init chưa xong |
| Init tự hoàn tất khi checks qua hoặc repo không có checks (10) | Tự chuyển Done | Một phần | `initOf` chỉ đọc trạng thái issue (`project-setups.ts:230-270`); việc đóng issue do agent/tự lái | |
| CI kèm khi tạo (10, 11) | Cấu hình checks sau khi tạo | Có (DS riêng) | `ci: true` với `newRepo` đẩy `.github/workflows/ds-check.yml` bằng token cá nhân (`project-setups.ts:453`, `server/setups/ci-workflow.ts`); repo có sẵn: `POST /projectSetups/{id}/ci` mở PR (`2026-11-08-…-pr6.md:113`) | Workflow chỉ chạy `pull_request`, cổng giấy phép, quét file nhạy cảm; chưa có ca thật (L3.3) |

### E. Checks và CI (`11-ci`, `34-checks`, `35-checks-and-review`)

| Tính năng (file docs) | Docs nói gì | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Một nguồn check mỗi repo: code-host CI / External CI / Agent self-check; chỉ nhận kết quả từ nguồn đã chọn (11, 34, 51) | Project settings › Code repositories › Checks | Có (API) / Chưa có (UI) | `ChecksSource = ['host','external','agent']` (`git.ts:168`), `PATCH /git/resources/:id` (`git.ts:1594-1660`); route `POST /git/checks` từ chối nguồn khác (`git.ts:1735-1750`); `grep checksSource client` không có kết quả | Mọi repo đang `host` |
| Bộ sinh CI GitHub Actions: trigger PR / branch push / tag, môi trường đích, thư mục app, App ID, prompt cho agent, secret `NB_STUDIO_API_KEY` (11, 34) | Generate từng trigger một | Một phần | `POST /repositoryDeployments/ciWorkflows/generate` chỉ sinh workflow **push nhánh** build + tải archive lên (`server/routes/builds.ts:150-185,546-578`), mô tả ghi "pull request previews are not generated yet"; không có trigger tag; secret `DS_STUDIO_API_KEY` (`builds.ts:52`); không có trang client nào gọi `builds`/`repositoryDeployments` (`grep` trong `client/` chỉ ra file locale) | Workflow check riêng `ds-check.yml` (PR) là đường thực tế |
| External CI (Jenkins…): khoá CI theo repo, script báo pending/kết quả/log, đăng preview (34) | Script sinh sẵn | Một phần | "External CI" nhận organization key có `studio.checks` (`chenh-lech-upstream.md:546`); khoá CI theo repo `dsRepositoryCiKeys` (`builds.ts:47`); không có script Jenkins | Không dùng Jenkins |
| Khoá CI hết hạn 90 ngày, nhắc lead/admin (34) | Nhắc trước khi hết hạn | Một phần | Khoá CI 365 ngày (`builds.ts:50,856`); trạng thái `expired` chỉ tính khi đọc (`server/routes/organization-keys.ts:249-250`); không có job nhắc | |
| Agent self-check: `nb-studio check report`, agent build và đăng PR preview (34) | Không cần CI | Một phần | `ds-studio check report` (`git.ts:1745`) chỉ nhận head của PR nối với issue; không có preview NB3 để agent đăng | Trên runner dùng chung **cấm** `pnpm check/test/build` toàn repo (skill `ds-app-rules`, `2026-11-07-…:229`), nên self-check không thay được CI |
| Kết quả check + link log trên task ("Code & previews") (11, 34, 35) | Tab trên task | Có | `client/pages/issues/detail/issue-pull-requests.tsx:248-305` (ciState, từng check có link); `issue-preview.tsx` | Preview chỉ có cho repo NB2 |
| "Not reported yet", báo biến thiếu, thuộc tính "No preview needed", nhãn `no-preview` (34, 51) | Mặc định có preview, nhãn để bỏ | Cố ý khác | Ngược lại: preview chỉ khi PR có nhãn `preview` (`server/previews/service.ts:30`); `grep no-preview` không có | Opt-in hợp lý với RAM ít |
| Branch rules: lỗi check đánh thức Lead, check qua chạy bước sau, xung đột PR sinh việc sửa (35) | Ba công tắc wake | Cố ý khác | Đặt `wakeOn*` trả 400 `WAKE_RULES_UNAVAILABLE` (`git.ts:1599,1628-1634`); tự lái xử lý: không merge khi `ciState` khác `success` hoặc có `mergeBlocker` (`server/autopilot/evaluator.ts:337-363`), đánh thức khi đứng việc quá `stallMinutes` (`server/autopilot/stall.ts:229-301`) | Không có đánh thức tức thì khi CI đỏ hoặc xung đột, chỉ khi quá ngưỡng đứng việc |
| Check advisory (không chặn merge) (35) | Liệt kê check không bắt buộc | Có (API) | `referenceChecks` (`git.ts:288,1613`), "hiện ra nhưng không tính vào CI" (`chenh-lech-upstream.md:548`); không có UI | |
| Review bởi model của vendor khác (35) | Ưu tiên reviewer vendor khác | Cố ý khác | `ds_reviews` 12/12 khác model nhưng Opus review Sonnet (cùng vendor); Q7 giữ Opus (`2026-11-07-…:101,331`) | Codex sẵn trên runner, bật được không cần đổi mã |
| Merge: owner nghiệm thu; người có quyền force-merge có ghi lại; agent không merge (35, 51) | Agent không bao giờ merge | Một phần / Cố ý khác | "Merge anyway" cần `reason`, ghi `mergeForcedReason` (`git.ts:237,448,2147`), chỉ owner/lead/admin; **tự lái tự merge** khi đủ 7 điều kiện (`chenh-lech-upstream.md:466,507`) | Chủ dự án chọn tự merge (U2) |

### F. Phát hành (`36-overview`, `37-previews`, `38-environments`, `39-versions`, `40-release`)

| Tính năng (file docs) | Docs nói gì | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Trang Releases theo project: Preview / Staging / Release / Production (36) | Bốn giai đoạn mỗi project | Một phần | Tab `previews`, `staging`, `releases`, `pending` + bộ chọn project (`client/pages/releases/index.tsx:52,480-545`) | Preview/staging chỉ có dữ liệu cho repo NB2 |
| Pending release; đánh dấu testing/production tính từ quan hệ commit; ghi version cũ thì gỡ đánh dấu (36) | | Có | `chenh-lech-upstream.md:388-390`; `deploys/pending`, `deploys/marks` (`client/hooks/use-releases.ts:197,213`) | |
| Nhắc lead việc chưa lên production (36) | Nhắc định kỳ | Có | `PENDING_REMINDER_MS` 3 ngày, `remindPending` (`server/releases/service.ts:27-28,1310-1330`) | |
| Lỗi deploy và yêu cầu duyệt vào Inbox (36, 38) | Inbox hiện deploy failed + approval | Một phần | Yêu cầu đánh dấu production vào Inbox ("Production marks to decide", `chenh-lech-upstream.md:393`); `server/previews/service.ts` không gọi thông báo nào khi dựng lỗi | |
| **PR preview cách ly cho từng PR** (34, 37, 51) | Mỗi PR một app, build status, mở từ task | Một phần (chỉ NB2) | Một chỗ preview duy nhất `preview.dsc.edu.vn`, compose NB2 (`compose.ts:1-19`), kích hoạt bằng nhãn + workflow `preview.yml` của `duongsinh-nocobase` (`trien-khai-vps.md:146`) | **Không có cho app NocoBase 3** |
| Preview dừng khi rảnh, tự chạy lại khi truy cập (38, 51) | Dormant restart on visit | Một phần | Dừng sau 30 phút; chỉ chạy lại khi bấm Mở trong Studio (`POST previews/{id}/open`, `chenh-lech-upstream.md:420-421`) | Studio không thấy traffic qua Traefik |
| Hosted environments: thêm môi trường, mục đích, chế độ chạy, URL `{appId}`, capacity, stop/dormancy, test connection (38) | Admin quản lý | Một phần | Studio: bảng `dsEnvironments` seed sẵn preview/staging/production, chỉ đọc (`database/main/seeds/202611060001_ds_environments.ts:23-56`, `client/pages/environments/index.tsx`, chỉ `GET /deploys/environments` ở `deploys.ts:694-718`). Trang plugin `/release-environments` tạo được môi trường nhưng chỉ có driver `external` không chạy gì | |
| Test app từ trang release hoặc CI tạo ở lần báo đầu; dialog có prompt Agent, CI, lệnh tay (38) | | Chưa có | `testApps` chưa làm (`chenh-lech-upstream.md:553`); `builds/report` + `apps/:appId/ensure` chỉ tạo bản ghi (`builds.ts:959-1030`) | |
| Chi tiết app: lịch sử deploy, log, stop, wake, delete (38) | | Một phần (chỉ preview NB2) | Preview: `open`, `down`, `retry`, `credentials` (`deploys.ts:2241-2360`); không có log (`previews/logs` cố ý chưa làm, `2026-11-06-…:323`) | |
| Variables theo môi trường và theo app, secret mã hoá, deploy dừng khi thiếu biến (38) | | Chưa có (Studio) / Có sẵn trong plugin | `previews/variables` chưa làm (`2026-11-06-…:323`); plugin `releases` có Variables tab và `VARIABLES_MISSING` (`app-plugin-releases/README.md:139-147`) nhưng không dùng được vì driver `external` | Biến preview NB2 cố định trong `COMPOSE_ENV` (`compose.ts:35-47`) |
| Môi trường protected + approver; deploy/rollback thành request; agent không deploy được (38) | | Một phần (chỉ ghi nhận) | Production protected, approver = owner, request phải gõ lại App id (`chenh-lech-upstream.md:391-396`); run token bị từ chối ở mọi route ghi | Không có deploy thật nên request chỉ là đánh dấu |
| Rollback từ lịch sử hoặc `nb-studio app rollback` (38, 40) | | Một phần | Đánh dấu `rolledBack` + danh sách issue nên mở lại (`chenh-lech-upstream.md:394`); không có lệnh rollback thật | |
| Release lines: chọn prefix gợi ý từ tag, nhiều line không chồng nhau, ẩn prefix (39) | | Một phần | Một line `stable` mỗi repo, `v*`, bỏ `v` (`chenh-lech-upstream.md:382-384`); `PUT /deploys/releaseLines/:id` chỉ nhận đúng một line (`deploys.ts:1383-1395`); `releaseLines/:id/tags` chỉ đọc (`deploys.ts:1436-1445`); không có UI sửa (`grep releaseLine client` không có kết quả) | |
| **"How to publish"**: chọn line, nhánh, commit (từ test app hoặc SHA), xem task gồm/thiếu, sinh lệnh tạo tag (39) | | Chưa có | `publishTarget` không có trong `deploys.ts` (danh sách route ở dòng 652-1912); phụ lục demo: `GET /api/deploys/releaseLines/{id}/publishTarget` (`docs/plans/archive/2026-11-01-…-phu-luc-api-cli.md:538`) | Hiện chủ dự án phải tự tạo tag bằng git |
| Phát hiện version qua webhook + poll; đổi line thì tính lại (39) | | Có | Webhook `push` tag + poll 10 phút; "Đọc tag" đếm lại (`chenh-lech-upstream.md:384-387`) | |
| Artifact: archive `pnpm build --tar` hoặc image; xem/tải từ danh sách version (39) | | Một phần | Upload archive qua ticket, link tải chỉ owner tạo, hash token (`builds.ts:1030-1110,1228-1290`; `chenh-lech-upstream.md:554`); `versionArtifacts` chưa có; không có UI | Ca thật tải lên/xuống cùng byte (U7) |
| **Deployment guide production**: chọn version, lệnh Docker hoặc `@nocobase/app-installer`, hoặc prompt cho Coding Agent; cài mới vs nâng cấp theo version đã ghi (40) | | Chưa có | Không có route/trang nào; Releases chỉ có nút "On production" kèm ghi chú (`trien-khai-vps.md:130-131`) | Production NB2 deploy tay qua Dokploy |
| Ghi nhận version production (40) | Ghi sau khi deploy | Có | `deploys/versions/:id/marks` (`deploys.ts:1674`), chỉ owner, ghi chú bắt buộc; người khác đề nghị (`chenh-lech-upstream.md:391-393`) | |

### G. Nâng cấp, sao lưu, xử lý sự cố (`45-upgrade-and-backup`, `51-faq`)

| Tính năng (file docs) | Docs nói gì | Trạng thái DS | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Sao lưu DB + cấu hình + khoá + tệp cùng một mốc (45) | `pg_dump -Fc`, giữ config, `.env`, khoá, storage | Một phần | `deploy/dokploy/backup.sh:13-24` (dump + `storage` mỗi ngày 03:15, giữ 14 bản); config nằm trong repo; khoá ở Dokploy + WSL | **Chỉ nằm trên VPS**: rclone/Drive chưa cấu hình (K0.3, `2026-11-08-…-pr6.md:124`) |
| Khôi phục và kiểm tra (45) | Khôi phục vào DB trống, kiểm đăng nhập/task/tệp/Git | Có | Đã thử vào DB tạm `restore_probe`, số dòng khớp (`trien-khai-vps.md:83-93`) | Chưa thử khôi phục từ bản ngoài VPS |
| Nâng cấp Studio: backup → đổi image → recreate; migration chạy khi khởi động (45) | | Có (quy trình tay) | `trien-khai-vps.md:28-67` (build trên dev 5–11 phút, `scp` ~87 MB, đổi `STUDIO_RELEASE`, chờ hết run, tạm dừng tự lái) | Cần máy dev; không làm được từ điện thoại |
| Quay lui bản cũ + khôi phục DB nếu migration (45) | | Có | `trien-khai-vps.md:63-67` | |
| Điều tra bằng CLI (`nb-studio`) (51) | Agent có Studio CLI xem trạng thái | Có | CLI `ds-studio` (`chenh-lech-upstream.md:452-462`) | |
| Ghi chú tổng quan: CLI cho thành viên tạo/theo dõi task từ Coding Agent cục bộ (02) | | Có | `ds-studio issue create`, agent-sessions (`chenh-lech-upstream.md:313-318`) | Thuộc nhóm tài liệu khác |

## Đáng làm cho Dương Sinh

Bối cảnh dùng để xếp hạng: một chủ dự án giám sát agent từ điện thoại; một VPS Dokploy dùng chung (Studio giới hạn 1,5 GiB, runner
2,5 GiB, còn khoảng 3 GB khả dụng, production NocoBase 2 trên cùng máy); GitHub riêng tư, một tài khoản; khoảng 6 app NocoBase 3
nhỏ cần preview → production. Số ngày là **ước lượng thô của người rà soát**, chưa đo, so với các bước U/K đã làm.

| # | Việc | Giá trị | Công (ngày) | Phụ thuộc | Rủi ro |
| --- | --- | --- | --- | --- | --- |
| 1 | **Tắt tự đăng ký trên production**: `auth.emailAndPassword.disableSignUp: true` trong `deploy/dokploy/config.yml`; thử lại lời mời qua `/invite/:token` | Cao (an toàn, docs coi là bước bắt buộc) | 0,1–0,25 | Không. Trước tiên kiểm production thật: trang `/main/login` có link "Đăng ký" không | Thấp. Lời mời có route riêng |
| 2 | **Sao lưu ra ngoài VPS** (K0.3 đã có kế hoạch, script sẵn) + bản sao `SECRETS_KEYS` ngoài VPS | Cao (một VPS là điểm hỏng duy nhất cho cả Studio lẫn khoá) | 0,5 phía agent (`rclone cryptcheck`, thử khôi phục từ Drive) | Chủ dự án cấp quyền Google | Thấp |
| 3 | **Driver Dokploy cho plugin `releases`** (thay `external`): mỗi App NB3 = một compose Dokploy (node 24 + `dist` từ archive `pnpm build --tar`; staging dùng Postgres, preview dùng SQLite cho nhẹ). Dùng lại allowlist an toàn của `server/previews/dokploy.ts` (chỉ compose do Studio tạo trong project `duongsinh-studio`) | **Cao nhất** cho mục tiêu 6 app: có ngay trang App/Environment, Variables + `VARIABLES_MISSING`, lịch sử deploy, rollback, protected + duyệt, `maxApps`, idle stop của plugin, không tốn RAM trong tiến trình Studio | 5–8 | Workflow CI build + upload đã có (`builds.ts` `workflowOf`, `uploadTickets`); khoá Dokploy (đã có); DNS: wildcard `*.preview…` hoặc một subdomain mỗi app; đo RAM một app NB3 (production build Studio đo RSS 614 MB) | Vừa–cao: RAM VPS dùng chung (phải `maxApps` 1–2 và dừng khi rảnh); khoá Dokploy toàn quyền (giữ allowlist theo tên + project) |
| 4 | **PR preview cho app NB3** trên driver ở #3: trigger `pull_request` + nhãn `preview` (giữ opt-in), một chỗ mỗi lúc, dừng khi rảnh; báo lỗi dựng vào Hộp thư + push | Cao (chủ dự án duyệt bằng mắt trên điện thoại trước khi merge) | 2–3 sau #3 | #3; bộ sinh CI thêm trigger PR (hiện ghi "not generated yet") | Vừa: Actions minutes dùng chung khoảng 2.000 phút/tháng (đo được ~19 phút tính phí mỗi lần CI Studio, `2026-11-08-…-pr6.md:109`) |
| 5 | **Hướng dẫn deploy production + ghi version** cho app NB3: từ version có artifact, sinh prompt cho Coding Agent (theo skill `nocobase-deployment`) hoặc compose Dokploy production; cài mới vs nâng cấp theo version đã ghi | Cao–vừa (production vẫn do người quyết, đúng tinh thần docs) | 2–3 | Gắn artifact với version (`versionArtifacts`); có thể dùng chính driver #3 cho production nếu chủ dự án đồng ý môi trường protected | Vừa: không để Studio tự chạm production NB2 hiện có |
| 6 | **"How to publish" từ điện thoại**: chọn commit (lấy từ staging đang chạy), xem việc gồm/thiếu (`publishTarget`), bấm tạo tag qua GitHub API (App có `contents: write`) thay vì sinh lệnh shell | Vừa | 1,5–2 | Không (dữ liệu version/issue đã có) | Thấp; tag là thao tác ghi lên repo, chỉ người, có xác nhận |
| 7 | UI trong mục Mã nguồn của project: nguồn check, check advisory, release line (hiện chỉ API/CLI) | Vừa | 1 | Không | Thấp |
| 8 | Chặn mở việc khác khi "Khởi tạo dự án" chưa xong (tự lái/scheduler) + thẻ nhắc trên trang project | Vừa (6 app mới sẽ đi qua bước này) | 0,5–1 | Không | Thấp |
| 9 | Tự động hoá phát hành Studio: GitHub Actions build `linux-x64` + đẩy lên VPS (hoặc lên chính builds của Studio), chủ dự án chỉ bấm Deploy trên Dokploy | Vừa (hiện mỗi lần nâng cần máy dev 12 GB, build 5–11 phút + `scp`) | 1–2 | Secret SSH/Dokploy trong Actions (cân nhắc kỹ) | Vừa: thêm bí mật vào CI; tốn phút Actions |
| 10 | `queuedExpiryMs` cho subject `issue` (ví dụ 24 giờ) để run không chờ mãi khi runner chết | Vừa–thấp | 0,25 | Không | Thấp |
| 11 | Nhắc khoá CI / khoá tổ chức / token cá nhân sắp hết hạn vào Hộp thư | Thấp–vừa | 0,5 | Không | Thấp |
| 12 | Email SMTP cho lời mời + đặt lại mật khẩu (`MAILERS_SYSTEM_*`) | Thấp (một người dùng; lời mời chép link được) | 0,25 + việc chủ dự án | Gmail App Password (đã hoãn) | Thấp |
| 13 | Trang chỉnh Lead Agent (first choice/fallback) và nối `fallbackAfterSeconds` | Thấp | 0,5–1 | Không | Thấp |

Thứ tự đề xuất: #1 → #2 (song song, nhỏ) → #3 → #4 → #5 → #6; #7–#13 chen vào khi rảnh.

## Không đáng làm (và lý do)

- **GitLab, Gitea, GitHub Enterprise, `studio.git.apiBaseUrls`, nhập App có sẵn, nhiều installation**: chỉ dùng GitHub.com với một tài
  khoản `covuaduongsinh`.
- **External CI kiểu Jenkins và script sinh sẵn**: chỉ dùng GitHub Actions; nguồn `external` đã nhận organization key nếu sau này cần.
- **Agent self-check làm nguồn check chính**: runner dùng chung bị cấm chạy `pnpm check/test/build` toàn repo vì làm VPS quá tải
  (`ds-app-rules`); kết quả do chính agent làm việc tự báo cũng không độc lập. Giữ `host` (GitHub Actions).
- **App Host in-process/Docker của plugin** (`releases.host`, `releases.docker`, `launchPrefix`, `previewPublicUrl`): in-process ăn RAM
  ngay trong container Studio 1,5 GiB; Docker mode cần Docker socket trong Studio, tương đương quyền root trên VPS đang chạy production
  NB2. Driver Dokploy (#3) đạt cùng mục tiêu mà không cần hai thứ đó.
- **Redis cho nhiều instance**: chỉ một instance.
- **S3 cho tệp**: lượng tệp nhỏ; disk local + sao lưu ngoài VPS (#2) là đủ.
- **Wake rules của branch rules** (`wakeOnChecks`, `wakeOnChecksPassed`, `wakeOnConflict`): tự lái đã giữ vai trò này; thêm hai cơ chế
  đánh thức sẽ chồng chéo. Nếu thấy chậm thì chỉ cần cho tự lái đánh thức ngay khi CI đỏ hoặc xung đột, không cần cả bộ.
- **Preview cho mọi PR mặc định với nhãn `no-preview` để bỏ**: ngược với giới hạn RAM; giữ opt-in nhãn `preview`.
- **Nhiều preview song song theo `{appId}` không giới hạn**: RAM. Một, cùng lắm hai chỗ.
- **Công tắc tắt webhook**: Studio có HTTPS công khai, poll đã là lưới an toàn.
- **Resend, menu Testing (`studio.testing.enabled`)**: không có nhu cầu hiện tại (menu Testing thuộc nhóm tài liệu quality, ngoài
  nhóm này).
- **Review chéo khác vendor bắt buộc**: Q7 đã chốt giữ Opus; Codex bật được bất cứ lúc nào không cần đổi mã.

## Những điểm chưa kiểm được

- Trạng thái sign-up trên production thật (#1) chỉ suy ra từ mã và cấu hình trong repo.
- RAM thật của một app NB3 khi chạy bản build trên VPS (cần cho #3/#4): chưa đo trong lần rà soát này.
- Không có nội dung trang `37-previews` và `50-storage` của docs (scrape rỗng).
