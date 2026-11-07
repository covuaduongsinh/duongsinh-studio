# Kế hoạch: khắc phục tồn đọng của Dương Sinh Studio — 07/11/2026

> Trạng thái: **đã duyệt 07/11/2026; chưa triển khai**. Phiên lập kế hoạch này không sửa mã, không đổi production, không gửi email hay push thật.
> Trên production chỉ chạy lệnh đọc (`docker inspect`, `SELECT`, `curl`).
> Liên quan: kế hoạch `docs/plans/2026-11-06-nocobase-studio-ra-soat-cap-nhat.md` (mục 7 Tiến độ), `docs/trien-khai-vps.md`,
> `docs/chenh-lech-upstream.md`, `docs/thuat-ngu.md`.

## 0. Bối cảnh

Chuỗi U1→U8 đã xong, nhưng còn việc mở ở mục 7 của kế hoạch 06/11. Dự án thật đầu tiên trên NocoBase 3 là `nocofen` (DS-24, tạo
07/11), chạy không qua `projectSetups` và lộ ra lỗi mà test không bắt được. Kế hoạch này gom các việc đó thành K0…K4.

Cách rà soát, thời điểm khoảng 22:40 giờ Việt Nam ngày 07/11/2026:

- Mã nguồn: `main` = `b8659d1`.
- Production: SSH chỉ đọc bằng `~/.ssh/vps_key`, truy vấn `psql` chỉ `SELECT`.
- GitHub: `gh.exe` và `git ls-remote`.
- `create-app`: chạy thật trên máy dev trong thư mục tạm.

Số liệu về run có thể đã đổi vì DS-24 vẫn đang chạy.

**Ba tiền đề của yêu cầu đã bị dữ liệu bác bỏ, kế hoạch đi theo dữ liệu:**

1. `b8659d1` **đã có trên production**, không cần triển khai lại (mục 1.1).
2. Kế hoạch cũ **có trên GitHub**, ở repo **công khai** `covuaduongsinh/nocobase` (mục 1.5).
3. Danh sách lệnh bàn giao của `ds-app-rules` không dùng được nguyên văn: `pnpm check` đã bị chủ dự án cấm trên runner, còn
   `pnpm licenses list --prod` không thấy thư viện client (mục 1.3).

## 1. Kết quả rà soát

Ký hiệu: ✅ xác nhận, ❌ bác bỏ, ⚠️ đúng một phần.

### 1.1 K0: vận hành

| Điểm                       | Kết luận                                  | Bằng chứng                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production chạy commit nào | `b8659d1`                                 | `docker inspect` của `duongsinh-studio-tluxoy-app-1`: mount `/srv/duongsinh-studio/releases/b8659d1/dist`, khởi động `2026-11-07T12:00:49Z`. `healthz` không có phiên bản: `{"ok":true,"app":{"name":"main","basePath":"/main"},"basePath":"/main"}`. Biến `STUDIO_RELEASE` không nằm trong env của container nên phải đọc qua mount |
| Bản sửa `prompt` đã lên    | ❌ tiền đề "chưa lên"                     | `dist/server/autopilot/scheduler.js:271`, `stall.js:337` trên VPS ghi `type: 'custom'`. Dump `studio-before-b8659d1-20261107-1232.dump` có sẵn; `ds_autopilot_events` ghi tạm dừng "Cập nhật Studio (b8659d1)"                                                                                                                       |
| Run kẹt do lỗi cũ          | ❌ không còn                              | `ag_run_inputs` chỉ có **1** input `prompt`: run `396411118026752` (DS-24), `cancelled`. `ag_runs`: 162 `completed`, 8 `failed`, 3 `cancelled`, 1 `running` (DS-24, hoạt động gần nhất 22:52)                                                                                                                                        |
| Dịch vụ đang chạy          | ✅ bình thường                            | Runner `vps-studio-runner` `online`, beta.23; WebSocket `/main/ws` trả 101; route Studio chưa đăng nhập trả 401; `nocobase.dsc.edu.vn` trả 302 về `/main/`, cuối cùng 200                                                                                                                                                            |
| Sao lưu chỉ nằm trên VPS   | ✅                                        | Không có `/srv/duongsinh-studio/backup.env`. `rclone listremotes` chỉ có `dropbox:`, `gdrive-dsc:` (không phải của Studio)                                                                                                                                                                                                           |
| Cron sao lưu đã chạy       | ❌ **chưa chạy lần nào** (phát hiện thêm) | `backups/backup.log` không tồn tại. Bản hằng ngày duy nhất là `studio-20261107-0935.dump`, chạy tay trước giờ cron đầu tiên (21:15 CET, tức 03:15 ngày 08/11 giờ Việt Nam). `backup.sh` trên VPS khớp repo (sha256 `6530c84c…`)                                                                                                      |
| Khoá Dokploy chưa xoay     | ✅                                        | Mục 7 U8 của kế hoạch 06/11; có `~/code/secrets/dokploy-api.secret`                                                                                                                                                                                                                                                                  |

### 1.2 K1: khởi tạo dự án

| Điểm                                                                  | Kết luận                                    | Bằng chứng                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mô tả không ghim phiên bản                                            | ✅                                          | `server/locales/vi-VN.ts` khoá `studioSetups.templateIssue`: `--template {{template}}`; `server/routes/project-setups.ts:416` chỉ truyền `template`. Mẫu mới nhất đã là beta.89, Studio đang ở beta.88 nên không ghim sẽ lệch                                                                                                                                                       |
| Đọc phiên bản lúc chạy được                                           | ✅                                          | `dist/package.json` của bản phát hành trên VPS có `nocobase.defaultTemplateVersion = 1.0.0-beta.88`                                                                                                                                                                                                                                                                                 |
| `newRepo` dùng `autoInit`, nên repo có README                         | ✅                                          | `server/git/service.ts:2324` `autoInit: input.empty !== true`                                                                                                                                                                                                                                                                                                                       |
| `create-app` từ chối thư mục không trống                              | ✅ đã chạy thật                             | Trong thư mục chỉ có `README.md`: `{"ok":false,"error":{"code":"SCAFFOLD_FAILED","message":"The directory … already exists and is not empty…"}}`. Mã: `@nocobase/create-app@0.1.0-beta.34` `dist/lib/scaffold.js:23`. Thư mục mới: thành công, tạo 412 file, không tạo `.git`                                                                                                       |
| Repo rỗng làm run lỗi (**bác bỏ cách (b)** nếu chỉ làm đơn giản)      | ✅ có trên production                       | Run `396410837008386`: `checkoutFailed`, `https://github.com/covuaduongsinh/nocofen.git has no branch main`. Chỉ hết lỗi khi chủ dự án tự thêm commit README (`fb9b54c`). Run tiếp theo làm xong Phần A trong 7 phút 25 giây (`396412550381568`), tạo `457a82a` trên `main`                                                                                                         |
| Cách (a) đã chạy được                                                 | ✅                                          | DS-24 Phần A: tạo ở `$TMPDIR` rồi chuyển vào gốc repo. Lịch sử `main`: `fb9b54c` → `457a82a`                                                                                                                                                                                                                                                                                        |
| README trùng tên khác hoa thường (phát hiện thêm)                     | ✅                                          | Template có `README.MD`, `auto_init` tạo `README.md`. Trên Linux hai file cùng tồn tại; trên bản mirror `D:\` sẽ đè nhau. Bình luận 17:51 của DS-24: agent phải tự gộp                                                                                                                                                                                                              |
| `config init` lỗi sau khi thêm Postgres (phát hiện thêm)              | ✅                                          | Bình luận 17:51: `DIALECT_REQUIRED` vì có cả hai driver; phải dùng `config init --dialect sqlite`                                                                                                                                                                                                                                                                                   |
| `init: empty` tạo repo mà agent không chạy được (phát hiện thêm)      | ✅ suy ra từ mã và run trên                 | `empty` đặt `autoInit: false` nên repo không có nhánh, trùng lỗi `checkoutFailed`; `empty` lại là lựa chọn mặc định của trang (`client/pages/projects/setup.tsx:45`). `existingRepo` trỏ vào repo rỗng cũng vậy                                                                                                                                                                     |
| `newRepo` chưa dùng được trên production (phát hiện thêm)             | ✅                                          | `ds_git_authorizations` = 0 dòng, trong khi `service.ts:2309` đòi token cá nhân (`GIT_PERSONAL_TOKEN_REQUIRED`) vì App cài trên tài khoản `User`                                                                                                                                                                                                                                    |
| Repo mới có thể không nối được vào App (phát hiện thêm, cần xác nhận) | ⚠️ mã xác nhận, cấu hình thật chưa đọc được | `docs/trien-khai-vps.md:110` hướng dẫn "Only select repositories"; `linkRepository` (`service.ts:1382`) đọc repo bằng token của App. Nếu đúng cấu hình đó, repo mới tạo trả lỗi ở bước nối và **repo mồ côi vẫn còn** (`project-setups.ts:362-375` không dọn), gọi lại thì 422 trùng tên. API từ chối token `gh` hiện có (`user/installations`), nên K1 kiểm trên trang cài đặt App |
| `projectSetups`, `newRepo` chưa có ca thật                            | ✅                                          | `ds_project_setups` = 0 dòng; `pm_projects.setup_issue_id` trống ở cả 4 dự án                                                                                                                                                                                                                                                                                                       |
| Bước "commit lên nhánh mặc định" mâu thuẫn skill (phát hiện thêm)     | ✅                                          | `server/agents/builtin-skills.ts`, skill `ds-development`: "Commit và push lên nhánh của công việc". Skill mới phải nêu ngoại lệ cho riêng commit mốc gốc                                                                                                                                                                                                                           |
| Chỉ có template `default`                                             | ✅ giữ nguyên                               | `project-setups.ts:72` `z.literal('default')`. Theo yêu cầu, chưa thêm `examples`                                                                                                                                                                                                                                                                                                   |
| Ca thật "trên Sandbox" không hợp với repo Sandbox                     | ⚠️                                          | `duongsinh-studio-sandbox` không phải app NocoBase 3 (`README.md package.json src test`) và là nơi thử tự lái, scaffold vào sẽ làm bẩn nó. K1 chạy trên **một repo thử mới**                                                                                                                                                                                                        |

### 1.3 K2: skill luật ứng dụng

| Điểm                                                 | Kết luận                          | Bằng chứng                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hiện có 5 skill `ds-*`, chưa có `ds-app-rules`       | ✅                                | `server/agents/builtin-skills.ts`; `ag_skills` có đúng 5 dòng                                                                                                                                                                                                             |
| Thêm vào mảng là production tự có khi khởi động      | ✅                                | `server/providers/project-defaults.ts`, `ensureBuiltinSkills`: tạo skill còn thiếu và thêm vào danh sách mặc định                                                                                                                                                         |
| Dự án cũ không tự nhận skill                         | ✅                                | Danh sách chỉ chép ở sự kiện `project.created`. `ag_skill_attachments`: `nocofen` 4, Sandbox 0, Dương Sinh App 0, Dương Sinh NocoBase 0                                                                                                                                   |
| `attach` thay cả danh sách                           | ✅ cạm bẫy                        | `@nocobase/app-plugin-agents` `dist/server/core/skills/skill.service.d.ts:54`: "Makes `skillIds` the skills attached to the target". Gắn thêm phải đọc `attached()` rồi gộp                                                                                               |
| Bắt buộc `pnpm check` trước bàn giao trên runner     | ❌ **gây sự cố nếu làm**          | Mô tả DS-24, mục "RÀNG BUỘC MÁY CHẠY" do chủ dự án chốt 07/11: `pnpm check` đã làm VPS quá tải, run `396415928893442` lỗi `leaseExpired`. Ràng buộc này **chỉ nằm trong mô tả của DS-24**, dự án sau sẽ gặp lại. `systemctl show user-1002.slice`: `MemoryMax=2621440000` |
| `pnpm licenses list --prod` kiểm được bàn cờ         | ❌ **không thấy thư viện client** | Theo `AGENTS.md`, thư viện client nằm ở `devDependencies`. Trên `~/code/nocofen-check`: `--prod` không có `react-chessboard`, bỏ `--prod` thì có. `chessground` cũng là thư viện client nên sẽ lọt qua                                                                    |
| Điều kiện "không có GPL/AGPL" qua được               | ❌ grep luôn dương tính           | `pnpm licenses list --prod \| grep -ciE 'GPL\|AGPL'` = 2 trên `nocofen-check`: `jszip` `(MIT OR GPL-3.0-or-later)` và `elkjs` `EPL-2.0 OR GPL-3.0-or-later`, đều là giấy phép kép chọn được phần không GPL. Studio cũng có `jszip`                                        |
| "Chỉ MIT/BSD/Apache/ISC/CC0" áp được cho toàn cây    | ❌ template đã vượt ra ngoài      | `nocofen-check` còn có `MPL-2.0`, `BlueOak-1.0.0`, `MIT-0`, `0BSD`, `Unlicense`, `CC-BY-4.0`, `EPL-2.0`. Luật phải áp cho **thư viện do ứng dụng tự thêm**                                                                                                                |
| Gói `@nocobase/*` không khai giấy phép               | ⚠️ cần chủ dự án biết             | Studio: 53 gói `@nocobase/*` là `Unknown`, 3 là `Apache-2.0`. `@nocobase/app-server` và `app-client` không có trường `license`, không có file LICENSE trong gói                                                                                                           |
| Giấy phép các thư viện cờ                            | ✅ đúng như yêu cầu               | `npm view`: `chessground`, `chessops`, `@lichess-org/pgn-viewer`, `tournament-pairings` = GPL-3.0-or-later; `stockfish` = GPL-3.0; `react-chessboard`, `cm-chessboard` = MIT; `chess.js` = BSD-2-Clause                                                                   |
| Grep file nhạy cảm dùng được                         | ⚠️                                | Template mới `git init`: rỗng (412 file theo dõi), đúng mong đợi. Nhưng repo có file cấu hình triển khai không chứa bí mật sẽ bị báo, ví dụ `deploy/dokploy/config.yml` của chính Studio                                                                                  |
| Màu nhận diện                                        | ⚠️ lệch                           | Yêu cầu ghi gold `#F5A623`, nhưng Studio dùng cam `#F7941D` (`public/assets/ds-logo.svg`, `chenh-lech-upstream.md:447`) và không có `F5A623`. Skill theo yêu cầu; không đổi logo Studio trong đợt này                                                                     |
| Các repo đang có vi phạm không                       | ❌ chưa thấy                      | `nocofen` nhánh `feat/fen-mvp`: 0 file nhạy cảm, `react-chessboard`, `chess-core`. `duongsinh-app`: chỉ `chess.js`, không có file nhạy cảm, nhưng còn template beta.86                                                                                                    |
| CI cho repo mới: App có đẩy được file workflow không | ❌ thiếu quyền                    | `server/git/github-app.ts:16-21` và `ds_git_apps.permissions` không có `workflows`; GitHub từ chối App sửa `.github/workflows` khi thiếu quyền này. `nocofen` không có `.github`                                                                                          |
| Có cần báo qua `git/checks` không                    | ❌ không cần                      | Mọi repo đang `checks_source = host`; App đọc thẳng check run của GitHub (`chenh-lech-upstream.md` mục 18). Không cần khoá tổ chức trong CI                                                                                                                               |
| Thiếu CI chặn tự lái                                 | ✅                                | `server/autopilot/evaluator.ts:314-318` đòi `ciState` là `success`; PR #1 của `nocofen` đang `ci_state = missing`                                                                                                                                                         |

Chi phí CI đo được: `~/code/nocofen-check.log` ghi riêng phần test `Duration 954.89s` trên máy dev; tổng thời gian `pnpm check` trên GitHub chưa đo.
Hạn mức GitHub Free là 12 USD mỗi tháng, giá Linux 2 nhân 0,006 USD/phút, tức khoảng 2.000 phút
([tài liệu GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions)), dùng chung cho mọi repo riêng tư của tài khoản.

### 1.4 K3: việc mở trong mục 7 kế hoạch 06/11

| Việc (nguồn)                                       | Kết luận                    | Bằng chứng                                                                                                                                                                                                                       | Xử lý      |
| -------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Nút đánh dấu/xoá gọi plugin với id tổng hợp (U4)   | ✅ theo mã; tái hiện ở K3.1 | `server/routes/inbox.ts:315` id là băm SHA-1; `client/extensions/nocobase-inbox/inbox-actions.ts:20` mọi thẻ đều có nút; plugin trả 404 `IN_APP_NOTIFICATION_NOT_FOUND` (`notification-in-app/dist/server/router.js:160-175`)    | K3.1       |
| `takeOver`, giới hạn lượt chưa vào Hộp thư (U4)    | ✅                          | `inbox.ts:54` khai báo `takeOver`, nhưng `decisionsOn` chỉ sinh `accept`, `answer`, `failed`. DS-24 đã chạm giới hạn lượt lúc 22:21                                                                                              | K3.1       |
| Dòng `step` tiếng Anh (U3)                         | ✅                          | `issue-work.ts:433` lấy từ input đầu. `ag_run_inputs`: 22 `statusChange` "DS-24 is in progress: work on it." sinh ở `server/providers/agent-executor.ts:283-284,351`; 3 `retry` "Retry the work of the previous run." của plugin | K3.2       |
| Thông báo tiếng Anh (U4)                           | ⚠️ chỉ còn dữ liệu cũ       | `notification_in_app_items`: 13/178 tiêu đề tiếng Anh, mới nhất 03/11 06:23, trước khi có vi-VN (S6.1). Không có dòng mới, không sửa dữ liệu lịch sử                                                                             | Đóng       |
| `taskGroups` thiếu `cursor` (U4)                   | ✅                          | `inbox.ts` không có từ `cursor`; `limit` tối đa 200 (`:1107`)                                                                                                                                                                    | K3.3       |
| `issuePanels` thiếu trường (U3)                    | ✅                          | `issue-work.ts:1586-1594` chỉ có `progress`, `ownerHandoff`, `pullRequests`, `commentRunLimit`                                                                                                                                   | K3.4       |
| `issueProgress` thiếu trường (U3)                  | ✅                          | `grep managerWait\|personalRunnerRequests server/progress server/routes/issue-work.ts`: không có                                                                                                                                 | K3.4       |
| Review chéo bằng Claude Opus (U1)                  | ✅ giữ nguyên, không có lỗi | `ds_reviews`: 12/12 `same_model = false`; 8 phiếu Opus review Sonnet. Codex: agent `disabled`, 1 run ngày 03/11, nhưng runner báo `codex` `ready`, `authenticated`                                                               | Quyết định |
| Ca thật `projectSetups`, `newRepo`                 | ✅ chưa có                  | Mục 1.2                                                                                                                                                                                                                          | K1         |
| Ca thật `kb/offers`                                | ✅ chưa có                  | `ds_kb_offers` = 0 dòng                                                                                                                                                                                                          | K3.5       |
| Tải bản build trên production                      | ❌ đã xong                  | Mục 7 U7: cùng byte; `ds_release_downloads` 1 dòng lúc 15:15 ngày 07/11                                                                                                                                                          | Đóng       |
| Ca thật trên Dương Sinh App                        | ✅ chưa có từ U1            | Công việc mới nhất DS-18 ngày 04/11; PR mới nhất 04/11                                                                                                                                                                           | K3.5       |
| `needsYou` chặn tự lái (U1 việc 1)                 | ❌ đã xong                  | Mục 7 U2, ca DS-21                                                                                                                                                                                                               | Đóng       |
| `version` còn beta.86 (U1 việc 4)                  | ❌ đã xong                  | `package.json:4` = beta.88; `ds-studio/1.0.0-beta.88`                                                                                                                                                                            | Đóng       |
| PR #4 chưa đối chiếu GitHub (U1 việc 5)            | ❌ đã đối chiếu             | `gh pr view 4`: `MERGED 2026-11-06T13:11:25Z`                                                                                                                                                                                    | Đóng       |
| Menu tài khoản chưa xem ảnh (U2)                   | ✅                          | Mục 7 U2                                                                                                                                                                                                                         | K3.5       |
| Báo cáo tuần chưa gửi thật (U5)                    | ✅ chờ lịch                 | Không có thông báo nào chứa "tuần"; lần đầu theo lịch 08:00 thứ Hai 09/11                                                                                                                                                        | K3.5       |
| Email, web push, ngân sách (U7)                    | ✅ chưa bật                 | `STUDIO_EMAIL_ENABLED=false`; `web_push_subscriptions` = 0; `ds_budgets` = 0                                                                                                                                                     | Quyết định |
| Nhãn phụ, trang bảng nhóm, `statuses`, `humanLoad` | Giữ nguyên                  | Mục 7 U3, U4, U5: hạn chế đã ghi, không ảnh hưởng vận hành                                                                                                                                                                       | Liệt kê    |
| 28 route demo cố ý chưa làm                        | Giữ nguyên                  | Mục 7 U6: 158/186. **Chưa chạy lại** vì cần phiên đăng nhập; từ `96aba37`, `git diff --stat -- server/routes` chỉ thêm `budgets.ts` (không thuộc demo) và sửa `builds.ts`, `issue-work.ts`. K3.5 chạy lại                        | Liệt kê    |

Nhóm 28 route (theo mục 7 U6, không làm): `delegations`, `intakeDrafts`, `agentSessions/.../context`; OAuth và device flow của
`git/authorizations`; `git/marks|projects|repositoryCards|connections/reach`; `previews/logs|preference|variables`; `deploys` về pipeline và
môi trường theo App Host; `testApps`; `webhooks/{provider}/...`.

**Phát hiện thêm, không có trong yêu cầu:**

- `ds_autopilot_settings.sensitive_paths` của `nocofen` là `["https://github.com/covuaduongsinh/nocofen"]`, một URL không khớp đường dẫn nào, nên ghi đè mất danh sách mặc định (`DEFAULT_SENSITIVE_PATHS`, gồm `.github/workflows/**`). Hiện vô hại vì tự lái của dự án này đang tắt, nhưng phải sửa trước khi bật (K3.6).
- 32 công việc DS-25…DS-56 sinh từ `pm_plans` `396407391387648` (`source_kind = intake`), mỗi dòng gạch đầu dòng của mô tả thành một công việc, rồi chủ dự án huỷ cùng lúc 17:14. Đây là hành vi của luồng intake, không phải lỗi. Prompt dài nên tạo thành một công việc; chỉ ghi vào tài liệu (K4).

### 1.5 K4: tài liệu

| Điểm                                                           | Kết luận                                | Bằng chứng                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tài liệu trỏ tới `D:\code\nocobase\docs\plans`                 | ✅                                      | `.agents/rules/duongsinh-studio.md:4`, `docs/chenh-lech-upstream.md:4`, `docs/trien-khai-vps.md:3,167`, `docs/plans/2026-11-06-*.md`                                                                                                                                                                                                       |
| Một **script** cũng phụ thuộc đường dẫn đó (phát hiện thêm)    | ✅                                      | `scripts/compare-studio-api.mjs:16` `/mnt/d/code/nocobase/docs/plans/…phu-luc-api-cli.md`                                                                                                                                                                                                                                                  |
| Kế hoạch "không có trên GitHub"                                | ❌ **có, và công khai**                 | `git branch -a --contains 26b0bdcba4`: `origin/v3-main`. `gh api repos/covuaduongsinh/nocobase`: `private = false`. Raw của `2026-11-02-nocobase-studio-s5-phat-hanh.md` trả 200. Agent trên VPS vẫn không đọc được theo đường dẫn `D:\`, nên việc chép vẫn cần                                                                            |
| Nội dung công khai có gì                                       | ⚠️ không có khoá, có thông tin vận hành | Quét 31 file `.md` trên `origin/v3-main` (giá trị đã che): 0 mẫu khoá (`ghp_`, `github_pat_`, private key, `AKIA`, `sk-`); IP VPS ở 14 dòng; 3 dòng giống số điện thoại trong 2 file; 1 dòng có email; 4 dòng khớp mẫu mật khẩu/token, xem dạng đã che thì đều giống mô tả API hoặc tên header. Mẫu regex có thể bỏ sót, cần người đọc lại |
| Repo Studio riêng tư, chép vào được                            | ✅                                      | `gh repo view`: `isPrivate = true`                                                                                                                                                                                                                                                                                                         |
| Thông số runner trong tài liệu sai (phát hiện thêm)            | ✅                                      | `trien-khai-vps.md:154` ghi `MemoryMax=2G MemorySwapMax=1G CPUQuota=150%`; thực tế `MemoryMax=2621440000` (2,5 GiB), `MemorySwapMax=536870912` (512 MiB), `CPUQuotaPerSecUSec=3s` (300 %)                                                                                                                                                  |
| Quy trình cập nhật thiếu bước tạm dừng tự lái (phát hiện thêm) | ✅                                      | `grep -n "paused\|tạm dừng" docs/trien-khai-vps.md` không có kết quả, trong khi các lần cập nhật đều làm (`ds_autopilot_events`)                                                                                                                                                                                                           |
| Mô tả cron sao lưu                                             | ⚠️                                      | Tài liệu nói có log `backup.log` và đã chạy, thực tế chưa (mục 1.1)                                                                                                                                                                                                                                                                        |

Bảy kế hoạch còn được tham chiếu, tổng 2.796 dòng (`wc -l`): `2026-11-01-nocobase-studio-ke-hoach-phat-trien.md` 449, `…-dac-ta-demo-api.md` 136,
`…-phu-luc-api-cli.md` 1.593, `2026-11-02-nocobase-studio-s5-phat-hanh.md` 141, `2026-11-02-khao-sat-vps-s5.md` 63,
`2026-11-03-nocobase-studio-s6-hoan-thien.md` 160, `2026-11-04-studio-autopilot.md` 254.

## 2. Mục tiêu, phạm vi, nguyên tắc

- Mục tiêu: có bản sao lưu ngoài VPS đã thử khôi phục; tạo dự án mới một bước mà agent chạy được ngay; luật ứng dụng và giới hạn runner nằm trong hệ thống thay vì trong từng prompt; đóng các việc mở còn ảnh hưởng người dùng; tài liệu đọc được từ repo.
- Ngoài phạm vi: thêm template `examples`; 28 route demo; bật App Host; đổi logo Studio; nâng lên beta.89; sửa mã `nocofen`.
- Nguyên tắc: không đụng `nocobase.dsc.edu.vn` và stack khác trên VPS; bí mật không in, không commit; lệnh nặng chạy foreground trên máy dev; không chép đè template; mỗi lần đổi production đều sao lưu trước và hỏi chủ dự án; kiểm chứng trong phạm vi file bị ảnh hưởng theo `AGENTS.md`.

## 3. Các bước

Ước lượng ngày là phán đoán của người lập kế hoạch, so với độ lớn các bước U1–U8, chưa đo.

### K0 — Vận hành (agent ~0,5 ngày, cộng thời gian của chủ dự án)

**K0.1 Không triển khai lại.** `b8659d1` đã chạy, không có run kẹt. Không có file mã nào đổi.

**K0.2 Kiểm tra cron đầu tiên.** Sau 03:15 ngày 08/11 giờ Việt Nam: có `backups/backup.log`, không có lỗi, có `studio-20261108-*.dump` và `storage-20261108-*.tar.gz`. Lỗi thì sửa trước khi làm K0.3.

**K0.3 Đẩy sao lưu lên Google Drive.** Không đổi mã; `deploy/dokploy/backup.sh` đã hỗ trợ.

Chủ dự án làm:

1. Trên máy có trình duyệt: `rclone authorize "drive"`, chọn scope `drive.file`, đưa kết quả vào `rclone config` trên VPS, tên remote `studio-backup`. Không dùng `gdrive-dsc:`.
2. Khuyến nghị thêm remote mã hoá `studio-backup-crypt` trỏ vào `studio-backup:duongsinh-studio`, vì dump có email người dùng. Giữ passphrase ngoài VPS; mất passphrase là mất bản sao lưu.
3. Tạo `/srv/duongsinh-studio/backup.env` (quyền 600): `REMOTE=studio-backup-crypt:` (hoặc `REMOTE=studio-backup:duongsinh-studio` nếu không mã hoá).
4. Kiểm tra `SECRETS_KEYS` đã có bản sao ngoài VPS; thiếu nó thì mọi giá trị niêm phong trong dump không mở được.

Agent làm, sau khi chủ dự án báo xong:

1. Chạy `backup.sh` một lần, xem file trên remote bằng `rclone lsl`, không in cấu hình rclone. Với remote mã hoá, `rclone check` không so được hash; dùng `rclone cryptcheck` để kiểm thay và ghi lại.
2. Khôi phục **từ bản trên Drive**: tải về thư mục tạm, `pg_restore` vào database tạm `restore_probe` trong container `db`, so số bảng và số dòng `pm_issues`, `ag_runs`, `ds_budgets`, rồi xoá database tạm và file tạm.
3. Kiểm tra lại `nocobase.dsc.edu.vn` trả 200 và ghi kết quả vào `docs/trien-khai-vps.md`.

**K0.4 Xoay khoá Dokploy.** Chủ dự án làm: tạo khoá mới trên Dokploy, đổi `DOKPLOY_API_KEY` ở Environment của compose `studio`, cập nhật `~/code/secrets/dokploy-api.secret`, Deploy, rồi xoá khoá cũ. Nên làm khi không có run đang chạy. Agent kiểm: `healthz` ok, xem trạng thái preview không có lỗi khoá, không dựng preview mới.

**Quy trình dùng cho mọi lần đưa K1–K3 lên production** (`docs/trien-khai-vps.md`):

1. Trên máy dev: `pnpm lint`, `pnpm typecheck`, test, `pnpm build --target linux-x64 --node-version 24`, `pnpm nocobase dist check`.
2. Chờ không còn run `running`; hỏi chủ dự án.
3. Tạm dừng tự lái Dương Sinh App và Sandbox với lý do `Cập nhật Studio (<sha>)`; `nocofen` đang tắt.
4. Tạo `studio-before-<sha>-<ngày>.dump`.
5. Chép và giải nén bản phát hành, đổi `STUDIO_RELEASE`, chỉ Deploy compose `studio`.
6. Kiểm mount đúng `<sha>`, `healthz`, WebSocket 101, đăng nhập, `nocobase.dsc.edu.vn` 200.
7. Bật lại tự lái, dọn còn 3 bản phát hành.

### K1 — Khởi tạo dự án đúng chuẩn (~2,5 ngày)

Chọn **cách (a)** (xem mục 6, Q1).

Thay đổi:

1. **Đọc phiên bản lúc chạy.** Hàm mới `server/setups/template-version.ts` đọc `nocobase.templatePackage` và `nocobase.defaultTemplateVersion` từ `package.json` ở gốc ứng dụng, chạy được cả dev lẫn `dist`. Thiếu giá trị thì route từ chối, không rơi về `latest`.
2. **Viết lại `studioSetups.templateIssue`** ở `server/locales/{vi-VN,en-US,zh-CN}.ts`, truyền tham số từ `server/routes/project-setups.ts`. Nội dung yêu cầu:
   - Kiểm `node -v` ≥ 24, `pnpm -v` ≥ 11; thiếu thì dừng và báo.
   - Tại thư mục tạm ngoài repo: `pnpm create @nocobase/app <tên> --template=@nocobase/app-template-default@<phiên bản> --no-install`. Không thêm `@beta` (README của `create-app`).
   - Chuyển mọi file, kể cả file ẩn, vào gốc repo, giữ `.git`. Xoá `README.md` do GitHub tạo, giữ `README.MD` của template để sau này nâng cấp không lệch và không đè nhau trên Windows.
   - `pnpm install`, `pnpm add @nocobase/db-postgres`, `pnpm nocobase config init --dialect sqlite`, `pnpm nocobase config check`.
   - Không commit `config.yml`, `.env`, `storage/`. Ghi `docs/nguon-goc.md`: template, ngày tạo, phiên bản gói chính, câu "tạo bằng create-app, không sao chép từ app khác".
   - Commit mốc gốc **lên nhánh mặc định**, không force-push. Mọi việc sau làm trên nhánh riêng.
   - Theo giới hạn runner (K2): không chạy kiểm tra toàn repo.
3. **Repo luôn có commit đầu.** `server/git/service.ts`: `createRepository` luôn `auto_init`, kể cả `init: empty`. Sửa test đang kỳ vọng ngược lại.
4. **`existingRepo` rỗng bị từ chối sớm.** Trong `project-setups.ts`, kiểm `branchHead` trước khi tạo project; repo chưa có commit trả 400 `GIT_REPOSITORY_EMPTY` kèm hướng dẫn.
5. **Repo mới mà App chưa với tới.** Trả lỗi riêng `GIT_REPOSITORY_NOT_INSTALLED`, nêu rõ repo đã được tạo, cần thêm vào App rồi dùng `existingRepo`. Không tự xoá repo.
6. **Trang Thiết lập dự án** (`client/pages/projects/setup.tsx`, locale): hiện rõ phiên bản template và hiển thị đúng hai lỗi mới.
7. **Ghi quyết định** vào `docs/chenh-lech-upstream.md`: chỉ có template `default`, chưa thêm `examples`; cách (a).

Test:

- `tests/server/project-setup-routes.test.ts`: mô tả có đúng phiên bản đọc từ `package.json`, không còn `--template default`; `empty` gửi `auto_init: true`; `existingRepo` rỗng trả 400 và không tạo project; repo mới không với tới được trả lỗi riêng; 401 khi chưa đăng nhập, 403 khi không có quyền.
- `tests/client/project-setup.test.tsx`: hiển thị lỗi.
- `tests/client/locale-parity.test.ts`, `pnpm nocobase locales check`.

Kiểm chứng ca thật, sau khi đưa lên production:

1. Chủ dự án làm trước: nối token cá nhân (`git authorization use-token`), đảm bảo App với tới repo mới (mục "Việc chủ dự án").
2. Tạo qua trang Thiết lập dự án: repo riêng tư mới `ds-setup-probe`, `init: nocobase`, tắt tự lái, không dùng repo Sandbox.
3. Đạt khi: không có `checkoutFailed`; `main` có `README` → mốc gốc; `package.json` ghi đúng phiên bản; chỉ còn `README.MD`, không còn `README.md`; `git ls-files` không có file nhạy cảm; `docs/nguon-goc.md` đủ; `ds_project_setups` có một dòng; `projectSetups/{id}` báo `done`.
4. Xoá repo thử là việc không hoàn tác: **chủ dự án tự xoá**.

### K2 — Skill luật ứng dụng và giới hạn runner (~2 ngày; thêm ~1,5 ngày nếu làm CI)

**K2.1 Thêm skill `ds-app-rules`** (`server/agents/builtin-skills.ts`, phạm vi `project`). Giữ ngắn vì skill đi vào mọi run của dự án. Nội dung:

- **Phạm vi áp dụng:** chỉ repo NocoBase 3. Repo khác (NocoBase 2, sandbox) thì bỏ qua.
- **Nguồn gốc:** chỉ xây trên template tạo bằng `create-app`; không sao chép mã từ NocoCRM hay app khác; không đổi phiên bản `@nocobase/*`; nâng cấp chỉ qua skill `nocobase-app-upgrade`.
- **Quyền:** mọi route có `auth.required()` và kiểm quyền; mọi trang có `authz`; gán vai trò cho người cụ thể, không gán cho mọi người.
- **Dữ liệu:** không commit dữ liệu thật, mật khẩu, `.env`, `config.yml`, `.sqlite`, file dump; bí mật lấy từ biến môi trường hoặc Dokploy. Dữ liệu học viên là trẻ em: tối thiểu hoá, không đưa vào seed, test hay log.
- **Cơ sở dữ liệu:** chạy được trên SQLite và Postgres; boolean ghi `true`/`false`; không dùng hàm SQL riêng của một loại DB.
- **Giấy phép:** thư viện **do ứng dụng thêm** chỉ dùng MIT/BSD/Apache/ISC/CC0. Cấm `chessground`, `chessops`, `@lichess-org/pgn-viewer`, `tournament-pairings`, `stockfish` chạy trong trình duyệt. Bàn cờ dùng `react-chessboard` hoặc `cm-chessboard`, luật cờ dùng `chess.js`.
- **Giao diện:** vi-VN; navy `#2B3990`, gold `#F5A623`, font Roboto; tài liệu nằm trong `docs/` của repo.
- **Giới hạn runner** (lấy từ DS-24, thay cho ghi trong từng mô tả): trên runner dùng chung cấm `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm typecheck`, `tsc` toàn repo, `vitest run` không chỉ rõ file, và để `pnpm dev` chạy lâu. Mỗi lúc một lệnh: `pnpm exec vitest run <file>`, `pnpm exec eslint <file>`, `pnpm exec prettier --check <file>`. Commit và push sau từng bước nhỏ.
- **Ngoại lệ commit:** riêng công việc khởi tạo được commit mốc gốc lên nhánh mặc định.
- **Trước khi bàn giao, dán output** (đã sửa so với yêu cầu ban đầu, xem mục 1.3):
  - Có CI: dán kết quả CI của PR. Không có CI: ghi rõ `pnpm check` chưa chạy, chủ dự án chạy trên máy dev.
  - `grep -E "^\s+'?(chessground|chessops|@lichess-org/pgn-viewer|tournament-pairings|stockfish)@" pnpm-lock.yaml` phải rỗng. Đã thử cùng dạng pattern với `react-chessboard` trên lockfile của `nocofen-check`: ra đúng 2 dòng.
  - `pnpm licenses list` (**không** có `--prod`): báo mọi giấy phép GPL/AGPL không có lựa chọn `OR`. Hiện có `jszip`, `elkjs` là giấy phép kép, được bỏ qua.
  - `git ls-files | grep -iE "\.sqlite|\.env$|config\.yml$|\.dump"` phải rỗng; file cấu hình triển khai không có bí mật thì nêu tên và lý do.
  - Test route chưa đăng nhập trả 401, chạy theo từng file.

Sửa thêm: `ds-development` trong cùng file trỏ tới giới hạn runner. Skill đã có trên production được "tạo một lần", nên `ensureBuiltinSkills` **không** cập nhật bản có sẵn. Sửa `ds-development` phải qua thư viện skill trên production, chủ dự án duyệt trước.

Test: `tests/server/` (file skill hiện có hoặc file mới): `ds-app-rules` có trong danh sách, phạm vi `project`; dự án mới nhận skill; boot lần hai không tạo trùng; skill đã sửa tay không bị ghi đè.

**K2.2 Gắn cho dự án đang có** (chỉ khi chủ dự án đồng ý, mục 6 Q2). Đọc `attached()` rồi gộp, vì `attach` thay cả danh sách. Làm từ trang Skill của dự án hoặc route có sẵn. Kiểm: `ag_skill_attachments` tăng đúng một dòng, 4 skill cũ còn nguyên, brief của run kế tiếp có `ds-app-rules`.

**K2.3 CI cho repo mới** (chỉ khi chủ dự án đồng ý, mục 6 Q3). Khuyến nghị làm, theo cách **không mở rộng quyền của App**:

- `server/git/github.ts`: thêm ghi file qua Contents API (hiện chỉ đọc). `projectSetups` dùng token cá nhân của người tạo để đẩy `.github/workflows/ds-check.yml` sau khi tạo repo. Vì App không có quyền `workflows`, agent vẫn không sửa được CI bằng token của App; `.github/workflows/**` đã nằm trong danh sách nhạy cảm của tự lái.
- Workflow: chạy trên `pull_request`, `concurrency` huỷ lần cũ, `timeout-minutes`; các bước: `pnpm install --frozen-lockfile`, `pnpm check`, kiểm giấy phép, quét file nhạy cảm. Không dùng khoá tổ chức, không dùng secret.
- Studio đọc kết quả bằng `checks_source = host` có sẵn, **không** cần `git/checks`.
- Trường `ci` của `projectSetups` đang trả `deployError`: sửa để nhận lựa chọn này. Khi không có token phù hợp, tạo project vẫn thành công và báo chưa đẩy được CI.
- Trước khi chốt: đo tổng thời gian trên GitHub ở repo thử. Nếu quá tốn hạn mức 2.000 phút thì tách test nặng ra.

Test: nội dung workflow; token cá nhân thật sự được dùng; thiếu token không làm hỏng setup. Kiểm chứng trong ca thật K1: PR trên repo thử có check, `ci_state` chuyển `success`.

### K3 — Việc còn mở (~4,25 ngày)

| Bước | Ưu tiên | Việc                                                                                                                                                                                                                                                              | File sẽ đổi                                                                                                                                                                                      | Test và kiểm chứng                                                                                                                                                          | Ngày |
| ---- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| K3.1 | Cao     | **Tái hiện trước** bằng test đỏ: nút đánh dấu/xoá trên thẻ quyết định. Thẻ quyết định không hiện các nút đó, vì trạng thái lấy từ công việc. Đưa `takeOver` và giới hạn lượt chạy vào `decisionsOn`                                                               | `server/routes/inbox.ts`, `client/pages/inbox-decisions.tsx`; nếu khối Inbox không có điểm móc thì sửa `client/extensions/nocobase-inbox/inbox-actions.ts` kèm chú thích và ghi `.agents/rules/` | `tests/server/inbox-routes.test.ts`, `tests/client/inbox.test.tsx`; người phụ trách thấy, người khác không thấy; quyết định xong tự biến mất; thử trên dev không có API lỗi | 1,5  |
| K3.2 | Vừa     | `step` tiếng Việt: 3 chuỗi ở `agent-executor.ts:283-284,351` qua locale; `stepOf` đổi input `retry` của plugin thành câu tiếng Việt. Vẫn giữ nội dung gửi agent bằng tiếng Anh nếu cần                                                                            | `server/providers/agent-executor.ts`, `server/progress/service.ts`, `server/locales/*.ts`                                                                                                        | Test `stepOf` và tiến độ với `statusChange`, `retry`; `locales check`                                                                                                       | 0,5  |
| K3.3 | Thấp    | `taskGroups` phân trang theo `cursor`                                                                                                                                                                                                                             | `server/routes/inbox.ts`                                                                                                                                                                         | Test đủ trang, không trùng, tôn trọng quyền; so hợp đồng ở phụ lục                                                                                                          | 0,5  |
| K3.4 | Thấp    | `issuePanels`: `versionProgress`, `decisions`, `offers`, `previews`; `issueProgress`: `managerWait`, `personalRunnerRequests`, `waiting`, trường nào không có dữ liệu thì trả rỗng đúng hợp đồng                                                                  | `server/routes/issue-work.ts`, `server/progress/service.ts`                                                                                                                                      | Test quyền: contributor không thấy panel ngoài phạm vi                                                                                                                      | 0,5  |
| K3.5 | Vừa     | Ca thật còn thiếu: một `kb offer` trên Sandbox; một công việc nhỏ trên Dương Sinh App (agent → PR → review → CI → merge, có `database/**` thì chờ review thêm); xem ảnh menu tài khoản; kiểm báo cáo tuần sau 08:00 ngày 09/11; chạy lại `compare-studio-api.mjs` | Không đổi mã; ghi vào mục Tiến độ. Dương Sinh App phải được chủ dự án chọn công việc                                                                                                             | `ds_kb_offers` có dòng và được duyệt; PR merge; số route khớp hoặc giải thích chênh lệch                                                                                    | 0,5  |
| K3.6 | Vừa     | `sensitivePaths` không nhận URL; trả `nocofen` về mặc định **sau khi chủ dự án đồng ý**, vì đây là dữ liệu production                                                                                                                                             | `server/routes/autopilot.ts`, `client/pages/projects/project-autopilot.tsx`                                                                                                                      | Test: URL trả 400; danh sách rỗng hoặc `null` dùng mặc định                                                                                                                 | 0,25 |

Không làm trong K3: dịch lại 13 thông báo cũ; 28 route demo; nhãn phụ trên bảng plugin; trang riêng cho bảng nhóm; đổi ngưỡng `statuses`, `humanLoad`.

### K4 — Tài liệu (~0,5 ngày)

1. Chép 7 file ở mục 1.5 vào `docs/plans/archive/`. Trước khi commit, **đọc lại** các dòng khớp mẫu và thay giá trị bí mật nếu có; thêm `docs/plans/archive/` vào `.prettierignore` để giữ nguyên văn và tránh `format:check` báo lỗi.
2. Sửa đường dẫn: `.agents/rules/duongsinh-studio.md:4`, `docs/chenh-lech-upstream.md:4`, `docs/trien-khai-vps.md:3,167`, các dòng 6–8 của kế hoạch 06/11, dòng 27–30 của prompt 06/11, và **`scripts/compare-studio-api.mjs:16`** (đường dẫn tương đối theo repo).
3. `docs/trien-khai-vps.md`: sửa thông số runner theo giá trị thật; thêm bước tạm dừng tự lái và chờ hết run; sửa mô tả cron và đường dẫn khoá SSH; ghi kết quả K0.
4. `.agents/rules/duongsinh-studio.md`: thêm giới hạn runner, cách (a), quy định `ds-app-rules`; thêm ghi chú không tạo công việc từ prompt dài bằng intake.
5. Giữ `AGENTS.md` không đổi nếu không thêm rule file mới.

Kiểm chứng: `pnpm exec prettier --check` các file đã đổi, `pnpm exec vitest run tests/project/agents-md.test.ts` (link hợp lệ), `grep -rn 'D:\\code\\nocobase\|/mnt/d/code/nocobase' docs .agents/rules scripts` chỉ còn các mô tả lịch sử có chủ ý, `node scripts/compare-studio-api.mjs --swagger <file swagger>` đọc được phụ lục ở đường dẫn mới.

### Thứ tự

K0 → K4 → K1 → K2 → K3. Làm K4 sớm vì chỉ là tài liệu, và agent trên VPS đọc được ngay. K1 và K2 đưa lên production cùng lần để ca thật K1 đã có `ds-app-rules`.

Tổng khoảng **11 ngày làm việc** của agent nếu có K2.3 (0,5 + 2,5 + 3,5 + 4,25 + 0,5), theo ước lượng trên; chưa tính thời gian chờ chủ dự án và thời gian chạy ca thật.

### Việc chủ dự án phải tự làm

| Việc                                                                           | Thuộc    | Vì sao không phải agent                                       |
| ------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------- |
| Tạo remote rclone, passphrase, `backup.env`; kiểm bản sao `SECRETS_KEYS`       | K0.3     | Cấp quyền Google, giữ khoá                                    |
| Xoay khoá Dokploy                                                              | K0.4     | Đăng nhập Dokploy, thu hồi khoá cũ                            |
| Token cá nhân cho `newRepo` (cần tạo repo; thêm Workflows nếu có K2.3)         | K1, K2.3 | Tài khoản GitHub của chủ dự án                                |
| Kiểm cấu hình App "Only select repositories" và thêm repo thử                  | K1       | Trang cài đặt GitHub App                                      |
| Xoá repo thử `ds-setup-probe`                                                  | K1       | Không hoàn tác được                                           |
| Chọn công việc cho ca thật Dương Sinh App                                      | K3.5     | Quyết định nghiệp vụ                                          |
| Gmail App Password và cho phép lần gửi thử đầu tiên                            | Sau K0   | Tài khoản và quyết định gửi ra ngoài                          |
| Đăng ký web push trên thiết bị                                                 | Khi cần  | Thao tác trên trình duyệt của chủ dự án                       |
| Đọc lại phần công khai trên `covuaduongsinh/nocobase`, nếu chọn xử lý          | K4       | Đổi repo công khai và lịch sử git là quyết định của chủ dự án |
| Hỏi rõ giấy phép của gói `@nocobase/*` nếu cần pháp lý cho sản phẩm thương mại | Tuỳ      | Làm việc với bên cung cấp                                     |

## 4. Kiểm chứng đầu-cuối

1. Sau K0: file sao lưu mới có trên remote, khôi phục được từ chính bản đó, số dòng khớp; `nocobase.dsc.edu.vn` 200.
2. Sau K1 + K2: tạo dự án một bước qua giao diện, không can thiệp tay; agent không gặp `checkoutFailed`; repo sạch; brief có `ds-app-rules`; không có run `leaseExpired` do kiểm tra toàn repo.
3. Sau K3: chủ dự án xử lý được quyết định `takeOver` và giới hạn lượt từ Hộp thư; không còn nút báo lỗi; dòng tiến độ tiếng Việt.
4. Sau K4: một agent chỉ có repo Studio đọc được mọi kế hoạch được tham chiếu; `compare-studio-api.mjs` chạy không cần `/mnt/d`.
5. Tự động, trong phạm vi đã đổi: lint, typecheck, test; `tests/server/authorization-assignment-safety.test.ts` giữ nguyên baseline; test quyền cho route đổi.

## 5. Rủi ro

| Rủi ro                                                   | Giảm thiểu                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Đổi production khi DS-24 đang chạy làm mất lượt          | Chờ hết run `running`, hỏi trước; DS-24 đã chạm giới hạn lượt và đang chạy tiếp                      |
| Ca thật K1 làm VPS quá tải                               | `--no-install` khi scaffold; một lệnh mỗi lúc; tắt tự lái; run tương tự đã xong trong 7 phút 25 giây |
| Mất passphrase rclone crypt hoặc `SECRETS_KEYS`          | Giữ ngoài VPS; thử khôi phục thật trước khi coi là xong                                              |
| Dump lên Drive chứa dữ liệu cá nhân                      | Remote mã hoá; scope `drive.file`; giữ 30 ngày                                                       |
| Skill dài làm tốn token mọi run                          | Giữ ngắn, đo độ dài brief trong ca thật                                                              |
| Sửa skill có sẵn trên production ngoài luồng code        | Chủ dự án duyệt; ghi vào `docs/chenh-lech-upstream.md`                                               |
| CI tốn hết hạn mức dùng chung                            | Chỉ chạy trên PR, huỷ lần cũ, giới hạn thời gian; đo trước khi bật rộng                              |
| Token cá nhân có quyền rộng trong Studio                 | Fine-grained, giới hạn tài khoản và quyền cần thiết; đã niêm phong (`service.ts`, `personalClient`)  |
| Sửa extension UI Library làm khó nâng template           | Ưu tiên điểm móc của registry; nếu sửa thì chú thích và ghi rules                                    |
| Xử lý repo công khai không xoá được lịch sử đã công khai | Coi nội dung đã lộ là đã lộ; thay đổi thông tin thực sự nhạy cảm thay vì chỉ xoá file                |

## 6. Quyết định cần chủ dự án chốt

| #   | Câu hỏi                                                                         | Khuyến nghị                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Repo có README ở K1: (a) scaffold vào thư mục tạm rồi chuyển, hay (b) repo rỗng | **(a).** Đã chạy được trên DS-24. (b) đã lỗi `checkoutFailed` trên production; muốn dùng phải sửa runner upstream, hoặc Studio tự tạo commit đầu, tức là quay lại có commit                                                               |
| Q2  | Gắn `ds-app-rules` cho dự án đang có                                            | **`nocofen` ngay; Dương Sinh App khi mở việc lại; không gắn Sandbox và Dương Sinh NocoBase.** Sandbox không phải app NocoBase 3, Dương Sinh NocoBase là NocoBase 2                                                                        |
| Q3  | Đẩy sẵn file CI cho repo mới                                                    | **Có, bằng token của người tạo, đọc kết quả qua `host`, không qua `git/checks`.** Không có CI thì tự lái không merge được. Chi phí ~1,5 ngày và hạn mức Actions; đo thời gian trước khi bật rộng                                          |
| Q4  | Thời điểm rclone                                                                | **Ngay trong tuần này,** vì mọi sao lưu hiện chỉ nằm trên một VPS                                                                                                                                                                         |
| Q5  | Thời điểm Gmail App Password                                                    | **Sau K3.1,** khi các loại quyết định đã vào Hộp thư đầy đủ để email có ý nghĩa                                                                                                                                                           |
| Q6  | Hạn mức ngân sách ban đầu                                                       | **Toàn hệ thống: 100 lượt/ngày và 1.000.000 token đầu ra/ngày.** Dữ liệu 03–07/11: nhiều nhất 88 lượt (04/11) và 662.932 token đầu ra/ngày; chưa tính token cache. Chỉ 4 ngày có dữ liệu, xem lại sau một tuần. 80 % cảnh báo, 100 % chặn |
| Q7  | Review chéo                                                                     | **Giữ Claude Opus.** 12/12 phiếu khác mô hình tác giả; Codex sẵn sàng trên runner, có thể bật sau mà không cần đổi mã. Không bật DeepSeek                                                                                                 |
| Q8  | Kế hoạch trên repo công khai `covuaduongsinh/nocobase` (phát hiện thêm)         | **Đọc lại trước, rồi chuyển repo sang riêng tư nếu không cần công khai.** Không phát hiện khoá, nhưng có IP VPS, kiến trúc và vài dòng thông tin liên hệ. Quét tự động có thể bỏ sót                                                      |

**Đã chốt 07/11/2026, đều theo khuyến nghị:** Q1 cách (a) · Q2 gắn `nocofen` ngay, Dương Sinh App khi mở việc lại, không gắn Sandbox và Dương Sinh NocoBase · Q3 có CI, bằng token người tạo · Q4 rclone trong tuần này · Q5 Gmail App Password sau K3.1 · Q6 100 lượt và 1.000.000 token đầu ra mỗi ngày, xem lại sau một tuần · Q7 giữ Claude Opus · Q8 chủ dự án đọc lại rồi chuyển `covuaduongsinh/nocobase` sang riêng tư. Chủ dự án duyệt toàn bộ kế hoạch cùng ngày.

## 7. Tiến độ

- [ ] K0 — Vận hành
- [ ] K1 — Khởi tạo dự án đúng chuẩn
- [ ] K2 — Skill luật ứng dụng và giới hạn runner
- [ ] K3 — Việc còn mở
- [x] K4 — Tài liệu (07/11/2026)
  - Chép 7 file (2.796 dòng, khớp mục 1.5) từ bản cục bộ vào `docs/plans/archive/`; quét: 0 mẫu khoá, 0 số điện thoại, 1 email mẫu `studio@dsc.edu.vn`. Thêm vào `.prettierignore`.
  - Sửa đường dẫn trong `trien-khai-vps.md`, `chenh-lech-upstream.md`, `.agents/rules/duongsinh-studio.md`, hai kế hoạch 06/11 và `scripts/compare-studio-api.mjs` (nay tính theo vị trí file; đọc được 186 route từ phụ lục mới). Còn lại các nhắc tới mã upstream `D:\code\nocobase` là chủ ý.
  - `trien-khai-vps.md`: sửa thông số runner, đường dẫn khoá SSH, thêm bước chờ hết run và tạm dừng tự lái, ghi cron chưa chạy lần nào. `.agents/rules`: thêm mục "Projects created from Studio".
  - Kiểm: `tests/project/agents-md.test.ts` 3/3; prettier sạch cho `trien-khai-vps.md`, rules, script. Ba tài liệu (`chenh-lech-upstream.md` và hai kế hoạch 06/11) đã lệch định dạng từ trước, không sửa trong đợt này.

(Ghi ngày, commit, số liệu cổng kiểm tra, bản production, việc còn mở dưới từng dòng khi xong.)
