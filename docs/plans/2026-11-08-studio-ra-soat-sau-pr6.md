# Kế hoạch: rà soát sau PR #6 của Dương Sinh Studio — 08/11/2026

> Trạng thái: **chờ chủ dự án duyệt các điểm đánh dấu "HỎI"**; chưa sửa mã ngoài tài liệu này.
> Liên quan: `docs/plans/2026-11-07-studio-khac-phuc-ton-dong.md` (mục 6, 7), `docs/trien-khai-vps.md`, `.agents/rules/duongsinh-studio.md`.
> Mỗi bước L0…L5 một nhánh và một PR riêng, merge xong bước này mới sang bước sau. Không gộp như #6.

## 0. Bối cảnh

PR #6 (`1af8fb7`) đưa K4, K1, K2.1, K2.3 và phần lớn K3 vào `main`. Một lượt rà soát độc lập trên `main` `fbe2653` báo: 165 file test / 741
test xanh, lint, typecheck và `locales check` xanh, `format:check` **đỏ (48 file)**. Kế hoạch này kiểm lại từng điểm, rồi sửa theo thứ tự rủi ro.

Cách kiểm: mã trên `main` `fbe2653` trong worktree riêng; `pnpm install --frozen-lockfile` thật (1 phút 30 giây);
`pnpm exec prettier . --check`; `git ls-tree`; `gh.exe pr list`; đọc mã. Số liệu test của lượt rà soát độc lập **chưa được chạy lại ở đây**; mỗi bước sau tự chạy test trong phạm vi file đổi.

## 1. Kết quả rà soát

Ký hiệu: ✅ xác nhận, ❌ bác bỏ, ⚠️ đúng một phần.

| Điểm                                       | Kết luận                         | Bằng chứng                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules` là symlink đã commit        | ✅ **lỗi của tôi, gấp**          | `git ls-tree origin/main node_modules` → `120000 blob 7655bd0…`; `git ls-tree -r origin/main` có đúng 1 mục mode 120000. Vào `main` qua `1af8fb7` vì một lệnh `git add -A` khi `node_modules` là symlink trong worktree. `.gitignore` dòng 1 là `node_modules/` (có dấu `/` nên chỉ khớp thư mục, không khớp symlink) |
| Hậu quả của symlink                        | ✅                               | Worktree mới tạo từ `main` có `node_modules` → `/home/duongsinh/code/duongsinh-studio/node_modules`; `pnpm install` trên clone mới sẽ đụng symlink thay cho thư mục                                                                                                                                                   |
| `node_modules` của checkout chính          | ⚠️ đang hỏng dở (phát hiện thêm) | `/home/duongsinh/code/duongsinh-studio/node_modules` chỉ có 13 mục cấp cao, không có `.bin`, sửa lần cuối 01:37 ngày 08/11; `pnpm exec prettier` ở đó không tìm thấy lệnh. Không có tiến trình pnpm nào đang chạy. Chưa rõ nguyên nhân (nghi `git pull` hoặc `pnpm install` bị ngắt vì symlink). Chưa động vào        |
| `format:check` đỏ                          | ✅                               | `prettier . --check`: 48 file (10 trong `client/pages`, 6 `tests/server`, 6 `server/providers`, 4 `tests/database`, 3 `tests/client`, 3 `server/previews`…, 2 `docs/plans`). Ba tài liệu (`chenh-lech-upstream.md` và hai kế hoạch 06/11) đã đỏ từ trước PR #6                                                        |
| Không có CI cho chính repo Studio          | ✅                               | `.github/` không tồn tại; PR #6 merge được với `statusCheckRollup: []`                                                                                                                                                                                                                                                |
| PR #2, #3, #4, #5 còn mở                   | ✅                               | `gh pr list`: #2 `docs/k4-tai-lieu`, #3 `feat/k1-khoi-tao-du-an`, #4 `feat/k2-ds-app-rules`, #5 `fix/k3-viec-con-mo`. Không phải "đã có trong main": đây là **bản làm song song độc lập** (mục 2)                                                                                                                     |
| `decisionsOn` chạy truy vấn theo từng việc | ✅                               | `server/routes/inbox.ts`: `DECISION_SCAN = 50`; mỗi việc gọi `issueQueries.activities`, `dsOwnerHandoffDecisions`, `dsCommentRunGrants` rồi `agents().runs.list`. Gọi từ 6 chỗ; `inbox/pending` làm mới mỗi 60 giây (`client/hooks/use-follow-ups.ts:36`, `BADGE_REFRESH_MS`)                                         |
| `ds-check.yml` chỉ đẩy cho `newRepo`       | ✅                               | `server/routes/project-setups.ts`: điều kiện `body.ci && body.codeLocation === 'newRepo'`                                                                                                                                                                                                                             |
| Bước giấy phép của `ds-check.yml` yếu      | ✅                               | `server/setups/ci-workflow.ts`: chỉ `grep` năm tên thư viện trong `pnpm-lock.yaml`; không kiểm GPL/AGPL/LGPL tổng quát                                                                                                                                                                                                |
| Không có quy tắc "không commit symlink"    | ✅                               | `.agents/rules/duongsinh-studio.md` không nhắc                                                                                                                                                                                                                                                                        |

## 2. Đối chiếu PR #2–#5 với `main`

Các nhánh này tách từ `a597749`, đều là bản K-step làm độc lập với #6. Không có file nào trùng nội dung nên "đã có" chỉ đúng về chức năng. Phần chỉ có ở nhánh cũ:

| PR  | Nhánh                    | Chỉ có ở nhánh cũ                                                                                                                             | Đề xuất                                                                                          |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| #2  | `docs/k4-tai-lieu`       | không file nào chỉ có ở đây                                                                                                                   | Đóng: K4 đã có trong `main`                                                                      |
| #3  | `feat/k1-khoi-tao-du-an` | `client/pages/projects/setup.tsx`, `client/hooks/use-git-error-text.ts`, `use-project-setup.ts`, `tests/client/project-setup.test.tsx` (K1.6) | Đóng, **nhưng** tách phần giao diện K1.6 thành việc riêng nếu bạn muốn (mục L5)                  |
| #4  | `feat/k2-ds-app-rules`   | `server/setups/check-workflow.ts` và test, `tests/server/builtin-skills.test.ts`                                                              | Đóng; dùng `check-workflow.ts` làm tham khảo cho L3.2 và `builtin-skills.test.ts` cho test skill |
| #5  | `fix/k3-viec-con-mo`     | `server/progress/waits.ts`                                                                                                                    | Đóng; tham khảo cho L4                                                                           |

**HỎI chủ dự án** trước khi đóng #2–#5 (kèm bình luận "Superseded by #6") và trước khi xoá sáu nhánh: `docs/k4-tai-lieu`, `docs/plan-khac-phuc-ton-dong`,
`feat/k1-khoi-tao-du-an`, `feat/k2-ds-app-rules`, `fix/k3-viec-con-mo`, `worktree-k4-docs`. `docs/plan-khac-phuc-ton-dong` không có PR mở; kiểm không còn
việc nào chỉ có ở đó trước khi xoá.

## 3. Mục tiêu, phạm vi, nguyên tắc

- Mục tiêu: clone mới cài được; `pnpm check` xanh; mọi PR vào `main` phải qua CI; CI dùng được cho dự án có sẵn repo; Hộp thư không tốn truy vấn vô ích.
- Ngoài phạm vi: nâng NocoBase, template `examples`, 28 route demo.
- Nguyên tắc: không in hoặc commit bí mật; không đụng `nocobase.dsc.edu.vn`; production chỉ cập nhật khi chủ dự án đồng ý, theo `docs/trien-khai-vps.md`;
  dùng `git add <đường dẫn>` có chủ đích thay cho `git add -A`; mỗi worktree dùng `node_modules` riêng.

## 4. Các bước

### L0 — Gấp: dọn repo

1. `git rm --cached node_modules`; `.gitignore` đổi `node_modules/` thành `node_modules`. Test `tests/project/`: `git ls-files` không có symlink (mode 120000) và không có đường dẫn `node_modules`.
2. Hướng dẫn chủ dự án kiểm `~/code/duongsinh-studio` và `D:\code\duongsinh-studio`: `git status` sạch, `node_modules` là thư mục thật, `pnpm install` chạy được; nêu lệnh khắc phục nếu `git pull` vướng.
3. Sau khi chủ dự án đồng ý: đóng #2–#5 kèm bình luận, xoá sáu nhánh.
4. `.agents/rules/duongsinh-studio.md`: không commit symlink; worktree dùng `node_modules` riêng; đóng PR thay thế ngay khi merge.

### L1 — `pnpm check` xanh

`pnpm format` trên 48 file trong **một commit chỉ đổi định dạng** (`docs/plans/archive` vẫn ignore). Chạy `pnpm check` đầy đủ trên máy dev (foreground, test chia nhóm), dán phần tổng kết.

### L2 — CI cho chính repo Studio

`.github/workflows/check.yml` cho PR vào `main`: `install --frozen-lockfile`, `check:packages`, `lint`, `format:check`, `typecheck`, `locales check`, `vitest` (hai project chạy tách), `timeout-minutes`, `concurrency`.
Bỏ `build` nếu quá lâu và ghi lý do. Đo thời gian và số phút Actions mỗi lần, ghi vào mục Tiến độ. **HỎI** trước khi bật branch protection cho `main`.

### L3 — CI cho dự án dùng repo có sẵn

1. Route mới (hoặc mở rộng `projectSetups`) gửi `ds-check.yml` bằng `writeFileAsPerson` với token cá nhân của người bấm, đi qua PR nếu nhánh mặc định có bảo vệ. Kiểm quyền, `describeRoute`, test 401/403/thành công/thiếu token. Nút trên trang project, chuỗi 3 ngôn ngữ.
2. Bước giấy phép chạy `pnpm licenses list --json` (không `--prod`), fail với GPL/AGPL/LGPL không kèm `OR`; test chuỗi workflow.
3. **Sau khi HỎI:** đẩy CI cho `nocofen`, mở PR thử, xác nhận Studio đọc được check (nguồn `host`) và tự lái merge được khi xanh.

### L4 — Hiệu năng Hộp thư

Gom `dsOwnerHandoffDecisions` và `dsCommentRunGrants` thành mỗi bảng một truy vấn `where in` cho cả danh sách; chỉ đọc `activities` khi cần. Kết quả trả về không đổi. Test đếm số truy vấn hoặc số lần gọi `activities`.

### L5 — Việc còn mở của K0–K3

- Chủ dự án làm: K0.3 rclone (tạo client_id Google riêng, cấp quyền), xoá khoá Dokploy cũ `studio`, Gmail App Password (K3.1 đã xong nên đến lúc).
- Agent làm khi được đồng ý: hạn mức ngân sách Q6 (100 lượt, 1.000.000 token đầu ra mỗi ngày) nếu chưa đặt; chạy thật `ds-setup-probe` (`newRepo` + `ci: true`, đo thời gian CI); `kb offer` trên Sandbox; kiểm báo cáo tuần sáng 09/11; `issuePanels`: ghi rõ trường bỏ hẳn và lý do; giao diện K1.6 (từ #3) nếu bạn muốn.

## 5. Rủi ro

| Rủi ro                                                                 | Giảm thiểu                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `git pull` trên checkout chính vướng vì `node_modules` thật vs symlink | L0.2 nêu lệnh khắc phục; thử trên bản sao trước                     |
| Format hàng loạt che mất thay đổi thật                                 | Một commit chỉ đổi định dạng, tách khỏi mọi thay đổi khác           |
| CI của Studio làm cạn hạn mức Actions dùng chung                       | `concurrency`, `timeout-minutes`, đo phút mỗi lần; chỉ chạy trên PR |
| Branch protection khoá chính chủ dự án                                 | HỎI trước; bật sau khi CI chạy xanh ít nhất một lần                 |
| Đẩy CI vào repo có nhánh bảo vệ bị từ chối                             | Đi qua PR; không có token thì báo rõ, không làm hỏng việc khác      |
| Xoá nhánh làm mất việc chỉ có ở đó                                     | Mục 2 liệt kê phần độc nhất; chỉ xoá sau khi bạn đồng ý             |

## 6. Tiến độ

- [x] Bước 0 — Ghi kế hoạch (08/11/2026)
- [ ] L0 — Dọn repo
  - L0.1 và L0.4 xong trong PR của bước này: `node_modules` ra khỏi index, `.gitignore` dòng 1 thành `node_modules`, `tests/project/tracked-files.test.ts` (đã thử đỏ với một symlink giả rồi xanh khi sạch), quy tắc trong `.agents/rules/duongsinh-studio.md`.
  - Còn: L0.2 (chủ dự án kiểm hai máy, hướng dẫn trong báo cáo cuối) và L0.3 (đóng #2–#5, xoá sáu nhánh, chờ bạn đồng ý).
- [x] L1 — `pnpm check` xanh (08/11/2026)
  - Commit riêng chỉ đổi định dạng: 48 file, +2.683/−870 dòng; `tests/server/previews.test.ts` cần Prettier chạy hai lượt mới ổn định.
  - Các cổng chạy riêng từng bước trên máy dev (foreground/nền, một lệnh mỗi lúc): `check:packages` xanh; `lint` xanh (`--max-warnings 0`); `format:check` xanh; `typecheck` xanh (43,6 giây, ba tsconfig); `pnpm build` xanh (5 phút 19 giây); `vitest --project node`: 81 file, 192 test xanh (12 phút 4 giây); `vitest --project client`: 85 file, 549 qua, **2 timeout 30 giây** trong `header-hover.test.tsx` khi máy tải nặng; chạy lại riêng file đó: 3/3 qua. Chưa tách được nguyên nhân tải; ghi nhận là test chậm dễ timeout, để ý khi dựng CI (L2).
- [ ] L2 — CI cho chính repo Studio
  - Xong (08/11/2026): `.github/workflows/check.yml` (ba job: `static`, `test (node project)`, `test (client project)`; `timeout-minutes` 20/45/45, `concurrency` huỷ lần cũ). Chạy đầu tiên trên PR #10, cả ba **xanh**: `static` 2 phút 41 giây, test client 7 phút 10 giây, test node 7 phút 28 giây, chạy song song nên thời gian thực khoảng 7,5 phút; tổng khoảng 17,3 phút chạy, tính phí khoảng 19 phút (làm tròn lên mỗi job), tức ~0,11 USD mỗi lần theo giá 0,006 USD/phút. Hạn mức Free khoảng 2.000 phút mỗi tháng ≈ 100 lần chạy, dùng chung mọi repo riêng tư của tài khoản.
  - `pnpm build` không đưa vào CI: khoảng 5 phút 19 giây trên máy dev, chỉ sinh gói phát hành, đã chạy tay trước mỗi lần phát hành.
  - Chưa làm: branch protection cho `main` (**HỎI** chủ dự án; nên bật sau khi thấy check xanh thêm vài lần).
- [ ] L3 — CI cho dự án dùng repo có sẵn
  - L3.1 xong trong mã (08/11/2026): `POST /projectSetups/{projectId}/ci` mở **pull request** (nhánh `ci/ds-check`, không bao giờ đẩy thẳng nhánh mặc định) thêm `.github/workflows/ds-check.yml` bằng token cá nhân của người bấm (`proposeFileAsPerson`; thêm `createBranch` cho client GitHub). Kiểm quyền (`pm.members` `define-roles`), `describeRoute`, lỗi `GIT_PERSONAL_TOKEN_REQUIRED` (400), `GIT_BRANCH_EXISTS` và `GIT_FILE_EXISTS` (409), `GIT_REPOSITORY_NOT_LINKED`. Test `project-setup-routes`: 401, 403, 404, thiếu token (mô phỏng bằng đổi kết nối thành kiểu App), 201, trùng 409. Nút "Thêm CI" ở mục Mã nguồn của trang project (chỉ quản trị viên), chuỗi vi-VN/en-US/zh-CN, test `tests/client/project-code-ci.test.tsx` (3 ca).
  - L3.2 xong: bước giấy phép chạy `pnpm licenses list --json` **không `--prod`**, fail với GPL/AGPL/LGPL không kèm `OR` (`jszip` và `elkjs` vẫn qua), vẫn chặn năm thư viện cờ GPL theo tên. `tests/server/ci-workflow.test.ts` chạy bước đó bằng bash thật (10 ca).
  - Còn L3.3: đẩy CI cho `nocofen`, mở PR thử, xác nhận Studio đọc check và tự lái merge được khi xanh. **HỎI** chủ dự án và cần token cá nhân của bạn nối vào Studio; chỉ làm được sau khi bản này lên production.
- [ ] L4 — Hiệu năng Hộp thư
- [ ] L5 — Việc còn mở của K0–K3

(Ghi ngày, commit, PR, số liệu kiểm, việc còn mở dưới từng dòng khi xong.)
