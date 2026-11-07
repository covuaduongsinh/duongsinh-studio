# Kế hoạch S5 — Phát hành (Dương Sinh Studio) — 02/11/2026

> Trạng thái: **bản nháp chờ chủ dự án duyệt.** Chưa chạy lệnh nào, chưa đụng VPS.
> Kế hoạch tổng: `2026-11-01-nocobase-studio-ke-hoach-phat-trien.md` (mục 5 "S5 — Phát hành", mục 9 quyết định, mục 10 tiến độ).
> Hợp đồng tham chiếu: `2026-11-01-nocobase-studio-dac-ta-demo-api.md` mục 6 (preview, repository deployments, release lines, environments) và phụ lục `…-phu-luc-api-cli.md` (route `deploys/*`, `previews/*`, `builds/*`, `inbox/*`).

## 1. Vị trí hiện tại (sau S4)

| Đã có                                                                                                                       | Chưa có                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Studio chạy trên máy dev (WSL, SQLite, `127.0.0.1:13100`), runner cá nhân `may-dev-duongsinh`                               | Studio chưa có địa chỉ công khai → GitHub không gọi webhook được, người khác không vào được     |
| Kết nối GitHub bằng PAT fine-grained, poll 60 s; PR/checks/merge trong Studio                                               | GitHub App, webhook, credential ngắn hạn cho run                                                |
| CI `duongsinh-nocobase` (PR #1, chờ merge): dựng NocoBase 2.2.36 + Postgres 16 trong Actions, `run.mjs all` + `verify.mjs`  | Preview cho từng PR, môi trường staging, theo dõi phiên bản/production                          |
| Plugin `releases` 0.1.0-beta.16 đã cài (artifact disk `release-artifacts`), trang Apps/Deploy environments có sẵn từ plugin | Lớp Studio: môi trường của Dương Sinh, version lines, production marks, inbox quyết định deploy |
| Production NocoBase 2 (`nocobase.dsc.edu.vn`) chạy bằng Dokploy trên VPS 217.15.160.118                                     | — (S5 **không** deploy production, xem nguyên tắc 2)                                            |

## 2. Nguyên tắc của S5

1. **Không đụng production NocoBase 2 và dữ liệu thật.** Preview/staging chỉ dùng dữ liệu mẫu do `setup/run.mjs` sinh, không sao chép DB production (có dữ liệu cá nhân học viên, phụ huynh, học phí).
2. **Production chỉ ghi nhận.** Studio không bấm deploy lên `nocobase.dsc.edu.vn`; chủ dự án deploy qua Dokploy như hiện nay rồi đánh dấu "đã lên production" trong Studio (production mark). Cho Studio tự deploy là quyết định để sau S6.
3. **Mọi thao tác trên VPS, DNS, GitHub App, đăng nhập coding tool trên VPS đều hỏi trước** (câu hỏi có lựa chọn + khuyến nghị), làm từng bước, có đường lui.
4. **VPS dùng chung với production** → giới hạn tài nguyên cứng (Docker `mem_limit`/`cpus`) cho mọi thứ của Studio; preview tối đa 2 cái cùng lúc, tự tắt khi rảnh.
5. Bí mật (khoá secrets của Studio, private key GitHub App, mật khẩu DB, token runner) chỉ nằm trong biến môi trường/secret của Dokploy hoặc file `*.secret` trên VPS; không commit, không in ra chat.
6. Mỗi bước con tự đứng được: dừng ở bước nào thì những gì đã làm vẫn dùng được.

## 3. Quyết định cần chủ dự án chốt (hỏi ở đầu phiên triển khai S5)

| #   | Câu hỏi                                                      | Khuyến nghị                                                                                                                                                                                                        | Phương án khác                                                                                           |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Q1  | Đưa Studio lên đâu?                                          | VPS hiện tại qua **Dokploy**, tên miền `studio.dsc.edu.vn`, Postgres riêng (container riêng, không chung DB production), giới hạn 2 GB RAM                                                                         | Máy/VPS riêng (tốn thêm tiền, an toàn tách biệt hơn); giữ trên máy dev (không có webhook, không preview) |
| Q2  | Dữ liệu dev hiện tại (issue PM-*, agent, kết nối GitHub, KB) | **Cài mới** trên VPS, tạo lại cấu hình bằng script (`kb-import.mjs`, seed); máy dev giữ làm môi trường thử                                                                                                         | Chuyển nguyên DB SQLite → Postgres (phức tạp, ít giá trị)                                                |
| Q3  | GitHub App thay PAT?                                         | **Có**, tạo App thuộc tài khoản `covuaduongsinh` theo luồng manifest (Studio dựng sẵn), quyền: Contents RW, Pull requests RW, Checks RW, Actions R, Metadata R, Webhooks; giữ PAT làm dự phòng 1 tháng rồi thu hồi | Giữ PAT + poll (không webhook, không Checks)                                                             |
| Q4  | Runner dùng chung trên VPS                                   | **Có**, user hệ thống `studio-runner` (không root, không sudo, không quyền Docker), `nocobase-runner service install`, chủ dự án tự đăng nhập Claude Code/Codex bằng gói thuê bao qua SSH                          | Giữ runner trên máy dev (chỉ chạy khi máy bật)                                                           |
| Q5  | Preview cho PR của `duongsinh-nocobase`                      | **Theo yêu cầu**: chỉ PR có nhãn `preview` mới dựng (NocoBase 2 + Postgres ≈ 1–1,5 GB RAM mỗi cái), tối đa 2, tự tắt sau 30 phút rảnh, xoá khi PR đóng                                                             | Mọi PR đều có preview (tốn RAM); không preview (chỉ CI)                                                  |
| Q6  | Staging NocoBase 2                                           | **Một** staging cố định `staging-nocobase.dsc.edu.vn`, dữ liệu mẫu, cập nhật mỗi khi merge vào `main`                                                                                                              | Không staging (merge xong lên thẳng production bằng tay như hiện nay)                                    |
| Q7  | Truy cập preview/staging                                     | Sau đăng nhập NocoBase + **basic auth của Traefik** (hoặc chỉ IP văn phòng) để không lộ ra Internet                                                                                                                | Công khai                                                                                                |
| Q8  | Gắn nhãn phiên bản                                           | Tag `v*` trên `main` của `duongsinh-nocobase` (vd `v2026.11.1`); Studio đọc tag, tính "issue chờ phát hành"                                                                                                        | Không dùng tag, chỉ production mark theo commit                                                          |

## 4. Các bước triển khai

### S5.0 — Khảo sát VPS (chỉ đọc, ~0,5 ngày)

- Hỏi trước rồi mới SSH. Chỉ chạy lệnh đọc: `free -h`, `nproc`, `df -h`, `docker ps --format`, `docker stats --no-stream`, danh sách app/Traefik route của Dokploy, phiên bản Dokploy, bản ghi DNS của `dsc.edu.vn`.
- Ghi kết quả vào `docs/plans/2026-11-xx-khao-sat-vps-s5.md` (không ghi mật khẩu/IP nội bộ nhạy cảm ngoài IP công khai đã biết).
- **Cổng quyết định:** nếu RAM trống < 3 GB → đề xuất nâng VPS hoặc bỏ Q5/Q6 trước khi đi tiếp.

### S5.1 — Đưa Studio lên VPS (`studio.dsc.edu.vn`) (~1,5–2 ngày)

- Studio (repo `duongsinh-studio`): build bản phát hành theo skill `nocobase-deployment` của NocoBase 3 (`pnpm build --tar` → image Docker từ Dockerfile của template/`app-installer`); thêm `Dockerfile` + `deploy/dokploy/docker-compose.yml` vào repo (không chứa bí mật; biến lấy từ môi trường).
- Dịch vụ: `studio-app` (Node 24, `mem_limit 2g`), `studio-db` (Postgres 16, volume riêng, `mem_limit 512m`); `storage/` trên volume; Traefik của Dokploy cấp HTTPS.
- Cấu hình bằng `pnpm nocobase config set --from-env …`: `SECRETS_KEYS`, DB, `APP_KEY`, `client.app.title`, cổng; **đổi mật khẩu admin mặc định** ngay lần đầu.
- Seed vai trò/nhãn/prefix `DS` (prefix thật, khác `PM` của dev), nạp KB bằng `scripts/kb-import.mjs`, tạo lại agent Opus/Sonnet, kết nối GitHub (chủ dự án tự dán PAT/cài App qua UI).
- Sao lưu: backup Postgres hằng ngày + `storage/` theo cơ chế backup của Dokploy như production; thử khôi phục một lần vào DB tạm.
- Runner cá nhân trên máy dev đăng ký lại vào server mới (máy dev vẫn chạy được khi cần).
- **Kiểm chứng:** `https://studio.dsc.edu.vn/main/` đăng nhập được; `/api/cli/manifest` trả lệnh; `ds-studio login` từ WSL; production NocoBase 2 vẫn chạy bình thường trước/sau (đo `docker stats`, thời gian phản hồi trang đăng nhập).

### S5.2 — GitHub App + webhook (~1,5 ngày)

- Lớp Studio: `git/connections/startAppManifest` (manifest flow → `appId`, private key niêm phong bằng secrets, `webhookSecret`), `installationId`, `missingPermissions`, `permissionsUrl`; kết nối `kind: app` bên cạnh `kind: token` sẵn có.
- Webhook `POST /api/webhooks/github/connections/{id}`: kiểm HMAC SHA-256, xử lý `pull_request`, `check_run`, `check_suite`, `workflow_run`, `push` (tag) → cập nhật PR/checks ngay, poll lùi về 10 phút làm lưới an toàn; `repairWebhook`.
- `repoAccess`: cấp **installation token ngắn hạn** (1 giờ, giới hạn đúng repo) cho từng run thay PAT (đóng mục 11 của `docs/chenh-lech-upstream.md`).
- Đọc check runs thật (App có quyền Checks) → bỏ đường vòng `actions/runs` khi kết nối là App.
- **Kiểm chứng:** test webhook với chữ ký sai bị 401; PR mới trên sandbox hiện trong Studio < 10 s; run clone/push bằng installation token; thu hồi PAT không làm gãy gì.

### S5.3 — Runner dùng chung trên VPS (~1 ngày, cần chủ dự án đăng nhập)

- Tạo user `studio-runner` (không sudo, không nhóm `docker`), cài bằng install script của Studio (`/api/agents/dist/installScript --runner`), `service install` (systemd, tự khởi động), giới hạn `MemoryMax=3G` qua systemd.
- Chủ dự án SSH vào và tự đăng nhập Claude Code + Codex bằng gói thuê bao (hướng dẫn từng lệnh; tôi không nhập mật khẩu/token).
- `policy.json`: chỉ repo `covuaduongsinh/*`; biến `teamRunnersOnly` cho bí mật chỉ runner chung được dùng.
- Bật agent **Codex** để review chéo khác nhà cung cấp (nguyên tắc lead agent đã yêu cầu).
- **Kiểm chứng:** một issue sandbox chạy trọn trên runner VPS khi máy dev tắt; reviewer là Codex; RAM production không bị ảnh hưởng (theo dõi trong lúc chạy).

### S5.4 — Lõi phát hành: môi trường, Releases, inbox quyết định (~2 ngày)

- Môi trường (plugin `releases` + lớp Studio), giống demo nhưng theo nguyên tắc 2:
  - `preview` — purpose preview, chạy bên ngoài (docker trên VPS), tối đa 2, rảnh 30 phút thì dừng, xoá khi PR đóng;
  - `staging` — purpose test, không protected, 1 app NocoBase 2;
  - `production` — **chỉ ghi nhận**, protected, approvers = chủ dự án.
- Trang **Releases** (tab Previews · Staging · Releases · Pending release) và **Hosted environments** theo ảnh demo; bảng Issue / Project / "Đang ở đâu" (chưa deploy / ở preview / ở staging / ở production).
- Inbox nhóm **Cần tôi quyết định**: yêu cầu deploy staging/đánh dấu production (Approve phải gõ lại app id, Reject có lý do); `inbox/items|pending|waiting|reconcile`, badge `attention`.
- Bảng mới (migration tự chứa, có down): `dsEnvironments` (nếu plugin không đủ), `dsRepositoryApps` (repo ↔ app theo vai trò preview/staging/production), `dsBuilds`, `dsPreviews` (`external: true`, `url`, `status waiting|deploying|ready|blocked|failed|destroyed`, `sha`, `logsUrl`), `dsReleaseLines`, `dsVersions` (+ tasks, artifacts, deployments), `dsProductionMarks`, `dsDeploymentRecords`, `dsInboxNotices`.
- Quyền: business actions `rel.apps/view|read-logs|deploy`, `studio.previews/manage` vào catalog vai trò; admin deploy staging, chỉ chủ dự án ghi production mark; agent chỉ `view|read-logs` + `studio.previews/manage` (dựng/tắt preview của PR mình).

### S5.5 — Phiên bản & production marks cho `duongsinh-nocobase` (~1,5 ngày)

- Release line `stable`: nhánh `main`, pattern `v*`; phát hiện tag qua webhook `push` (S5.2) hoặc poll.
- `deploys/versions`: mỗi tag → danh sách issue (từ PR đã merge giữa hai tag), `taskCount`, so sánh với production mark.
- **Production mark:** chủ dự án bấm "Đã lên production" trên một phiên bản sau khi deploy bằng Dokploy (kèm ghi chú) → issue được gắn nhãn "in production"; tab **Pending release** liệt kê issue đã merge chưa có trong production.
- Gợi ý mở lại issue khi đánh dấu rollback (`reopenSuggestions`); nhắc chủ dự án sau 3 ngày nếu có issue chờ phát hành.
- **Kiểm chứng:** tạo tag thử `v2026.11.0-test` trên sandbox → phiên bản hiện với đúng PM-9; đánh dấu production → PM-9 có nhãn; xoá tag thử.

### S5.6 — Preview & staging NocoBase 2 trên VPS (~2–3 ngày)

- Workflow GitHub `preview.yml` trong `duongsinh-nocobase` (PR riêng, chủ dự án merge): khi PR có nhãn `preview` → build plugin (`ci/build-plugins.mjs` của PR #1) → báo Studio `ds-studio build status --state building` → gọi **webhook triển khai trên VPS** (dịch vụ nhỏ `studio-preview-agent` chạy bằng user riêng, chỉ nhận yêu cầu ký HMAC từ Studio) dựng compose `nocobase/nocobase:2.2.36-full` + Postgres với tên `pr-<n>`, chạy `setup/run.mjs all` (dữ liệu mẫu) → báo `ready` + URL `pr-<n>.preview.dsc.edu.vn`.
  - Lý do không dựng thẳng từ GitHub Actions bằng SSH: không để khoá SSH VPS nằm trong GitHub.
- Tự tắt sau 30 phút rảnh, xoá khi PR đóng/merge; tối đa 2 preview, cái thứ 3 xếp hàng (`blocked` kèm lý do).
- Staging: cùng cơ chế, app cố định `staging`, cập nhật khi merge vào `main` (hoặc khi chủ dự án bấm deploy staging từ Releases).
- Agent: chỉ dẫn mặc định thêm "khi issue có giao diện, gắn nhãn `preview`, chụp ảnh trên preview cho báo cáo bàn giao".
- **Kiểm chứng:** PR thử có nhãn `preview` → URL mở được, đăng nhập bằng tài khoản mẫu (mật khẩu sinh ngẫu nhiên, chỉ hiện cho người sửa được issue); PR đóng → container biến mất; `docker stats` production không đổi đáng kể; preview thứ 3 bị xếp hàng.

### S5.7 — (Tuỳ chọn) Preview cho chính `duongsinh-studio` (~1 ngày)

- Dùng `app-host` in-process đúng như demo (`pnpm build --target linux-x64 --tar` → `ds-studio deploy`), app `studio-pr-<n>`. Làm sau cùng, chỉ khi S5.1–S5.6 ổn và RAM còn dư.

## 5. Thứ tự, thời lượng, cổng dừng

| Thứ tự | Bước                 | Thời lượng | Cổng (dừng hỏi chủ dự án)                                             |
| ------ | -------------------- | ---------- | --------------------------------------------------------------------- |
| 1      | S5.0 khảo sát        | 0,5 ngày   | Trước khi SSH; sau khi có số liệu RAM                                 |
| 2      | S5.1 Studio lên VPS  | 1,5–2 ngày | Trước khi tạo app Dokploy, DNS, trước khi đổi gì chung với production |
| 3      | S5.2 GitHub App      | 1,5 ngày   | Trước khi tạo App trên GitHub                                         |
| 4      | S5.3 Runner VPS      | 1 ngày     | Trước khi tạo user; chủ dự án tự đăng nhập coding tool                |
| 5      | S5.4 Lõi phát hành   | 2 ngày     | — (chỉ code + test)                                                   |
| 6      | S5.5 Phiên bản       | 1,5 ngày   | Trước khi tạo tag thử                                                 |
| 7      | S5.6 Preview/staging | 2–3 ngày   | Trước khi cài dịch vụ preview lên VPS, trước khi thêm DNS wildcard    |
| 8      | S5.7 (tuỳ chọn)      | 1 ngày     | Hỏi có làm không                                                      |

Tổng ≈ 10–12 ngày làm việc. S5.4–S5.5 làm được trên máy dev song song khi chờ chủ dự án ở các cổng của S5.1–S5.3.

## 6. Kiểm chứng chung cho S5

- Mỗi bước: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` xanh (máy dev 12 GB: chạy test khi tắt dev, chia nhóm server/client nếu cần); test cho webhook (chữ ký), quyền deploy/mark, giới hạn preview.
- **Ca đầu-cuối của S5:** issue thật nhỏ trên `duongsinh-nocobase` (vd bổ sung bản dịch vi-VN) → agent code trên runner VPS → PR có nhãn `preview` → CI xanh + preview mở được → review Codex → chủ dự án xem preview, merge trong Studio → staging cập nhật → tag `v…` → chủ dự án deploy production bằng Dokploy như cũ → bấm "Đã lên production" → issue có nhãn in production, tab Pending release trống.
- **Bảo mật:** webhook sai chữ ký 401; contributor không deploy staging, không mark production; run token không gọi được route deploy; không bí mật nào trong log/transcript; preview không có dữ liệu thật.
- **An toàn production:** đo trước/sau mỗi bước trên VPS (RAM, CPU, thời gian phản hồi `nocobase.dsc.edu.vn`); có lệnh gỡ bỏ cho từng thành phần đã thêm.

## 7. Rủi ro

| Rủi ro                                                  | Giảm thiểu                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| VPS chung với production bị thiếu RAM/CPU               | Khảo sát trước (S5.0), `mem_limit` cho mọi container, preview theo yêu cầu tối đa 2, đề xuất nâng VPS nếu cần      |
| Runner agent trên cùng máy production có quyền quá rộng | User riêng không sudo/không Docker, `MemoryMax`, policy chỉ repo `covuaduongsinh/*`, không mount gì của production |
| Plugin `releases`/`app-host` beta thay đổi, README lệch | Ghi lệch vào `docs/chenh-lech-upstream.md`, ghim phiên bản, chỉ dùng phần cần                                      |
| Đăng nhập gói thuê bao trên VPS (điều khoản)            | Chủ dự án tự đăng nhập; công tắc chuyển API key đã dựng sẵn (quyết định 4)                                         |
| Webhook công khai bị lạm dụng                           | HMAC, chỉ nhận sự kiện cần, giới hạn tốc độ                                                                        |
| Preview vô tình dùng dữ liệu thật                       | Chỉ `setup/run.mjs` + dữ liệu mẫu; chặn hostname production trong container như CI PR #1                           |

## 8. Việc phụ thuộc bên `duongsinh-nocobase` (trước S5.6)

- Merge PR #1 (CI) và PR #2 (`AGENTS.md`); đưa phần giải đấu đang sửa dở lên PR khi chủ dự án báo "giải đấu xong".
- Thêm nhãn `preview` vào repo; quy ước tag phiên bản (Q8) ghi vào README.
