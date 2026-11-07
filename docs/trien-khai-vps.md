# Triển khai Dương Sinh Studio lên VPS (studio.dsc.edu.vn)

Bước S5.1 của kế hoạch `docs/plans/2026-11-02-nocobase-studio-s5-phat-hanh.md` (repo `D:\code\nocobase`). VPS
217.15.160.118 **dùng chung với production NocoBase 2** (`nocobase.dsc.edu.vn`) và nhiều dịch vụ khác, nên:

- không build gì trên VPS — bản phát hành build trên máy dev rồi chép lên;
- mọi container của Studio có giới hạn RAM/CPU;
- không đụng project Dokploy nào khác; Studio là project riêng `duongsinh-studio`.

## Cách chạy

| Thành phần | Ở đâu |
|---|---|
| Project Dokploy | `duongsinh-studio` → compose `studio` (nguồn "raw", nội dung = `deploy/dokploy/docker-compose.yml`) |
| Tên miền | `https://studio.dsc.edu.vn` → service `app`, cổng 13000, HTTPS Let's Encrypt (Traefik của Dokploy) |
| App | image `node:24.15.0-bookworm-slim` chạy `node dist/server/standalone.js` dưới user 1000, `mem_limit 1536m`, `cpus 1.5`, `NODE_OPTIONS=--max-old-space-size=1024`, đường dẫn `/main` |
| Bản phát hành | `/srv/duongsinh-studio/releases/<sha>/dist` (chỉ đọc), chọn bằng biến `STUDIO_RELEASE=<sha>` |
| Cấu hình | `/srv/duongsinh-studio/config.yml` (chỉ đọc) = `deploy/dokploy/config.yml`, không có bí mật |
| Dữ liệu tệp | `/srv/duongsinh-studio/storage` (chủ sở hữu 1000:1000): KB, tệp đính kèm, `runners/dist` (CLI + runner để cài) |
| Cơ sở dữ liệu | service `db` = `postgres:16-alpine`, volume `studio-pg`, `mem_limit 384m`, `shared_buffers=64MB`, `max_connections=30` |
| Bí mật | tab Environment của compose trên Dokploy; bản sao cho chủ dự án: WSL `~/code/secrets/studio-prod.secret` (chmod 600) |

Biến môi trường bắt buộc (tên, không có giá trị): `STUDIO_RELEASE`, `DB_PASSWORD`, `SECRETS_KEYS`,
`INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`; tuỳ chọn `APP_PUBLIC_ORIGIN`, `DB_DATABASE`, `DB_USERNAME`,
`INITIAL_ADMIN_USERNAME`. `SECRETS_KEYS` mất là mất mọi thứ đã niêm phong (token GitHub, khoá API): sao lưu riêng, không
đổi. `INITIAL_ADMIN_*` chỉ dùng ở lần cài đầu.

## Cập nhật lên phiên bản mới

Trên máy dev (WSL), trong `~/code/duongsinh-studio` sạch, đã `pnpm lint && pnpm typecheck && pnpm test`:

```bash
pnpm build --target linux-x64 --node-version 24
SHA=$(git rev-parse --short HEAD)
tar --exclude='*/.bin' --exclude='dist/.env' -czf ~/code/release/studio-$SHA.tar.gz dist config.example.yml
pnpm nocobase dist check
scp -i /mnt/c/Users/duongsinh/.ssh/id_ed25519 ~/code/release/studio-$SHA.tar.gz root@217.15.160.118:/srv/duongsinh-studio/incoming/
ssh -i /mnt/c/Users/duongsinh/.ssh/id_ed25519 root@217.15.160.118 \
  "mkdir -p /srv/duongsinh-studio/releases/$SHA && tar -xzf /srv/duongsinh-studio/incoming/studio-$SHA.tar.gz -C /srv/duongsinh-studio/releases/$SHA && chown -R 1000:1000 /srv/duongsinh-studio/releases/$SHA"
```

Sao lưu DB (mục dưới), rồi trên Dokploy: compose `studio` → Environment → đổi `STUDIO_RELEASE=<sha>` → Deploy. Migration
chạy tự động khi app khởi động (`migrations.autoRun`). Kiểm: `https://studio.dsc.edu.vn/main/api/healthz` trả `ok: true`,
đăng nhập được, xem log container.

Nếu `config.yml` đổi: chép `deploy/dokploy/config.yml` lên `/srv/duongsinh-studio/config.yml` rồi Deploy lại.

## Dọn bản phát hành

Trên VPS giữ 3 thư mục mới nhất trong `releases/` (bản đang chạy và hai bản để quay lui) và không giữ tarball trong `incoming/`
sau khi đã giải nén. Trước khi xoá, xem bản đang mount: `docker inspect -f '{{range .Mounts}}{{.Source}} {{end}}'
duongsinh-studio-tluxoy-app-1`. Việc này làm tay sau mỗi lần cập nhật, chưa có lịch tự động.

Dữ liệu sự kiện và brief của run hết hạn sau 14 ngày theo mặc định của `agents.runs.retentionDays` (giữ nguyên, không khai trong
`config.yml`); bản ghi run, usage và số liệu Dashboard không bị xoá.

## Quay lui

Đặt lại `STUDIO_RELEASE` về sha cũ (thư mục cũ còn trong `releases/`) và Deploy. Nếu bản mới đã chạy migration làm
đổi schema, khôi phục bản sao lưu DB chụp trước khi cập nhật (mục dưới) rồi mới chạy bản cũ. Giữ ít nhất 2 bản phát hành
gần nhất trong `releases/`.

## Sao lưu và khôi phục

Dokploy chưa có đích sao lưu (S3) nào (`destination.all` rỗng), nên dùng script riêng `deploy/dokploy/backup.sh`, cài ở
`/srv/duongsinh-studio/backup.sh`, chạy qua `/etc/cron.d/duongsinh-studio-backup` lúc 03:15 giờ Việt Nam (VPS đang `+01:00`,
nên dòng cron ghi `15 21`). Mỗi lần: `pg_dump -Fc` từ container `db` → `backups/studio-<ngày>.dump`, cùng
`storage-<ngày>.tar.gz`, log ở `backups/backup.log`. Giữ 14 bản hằng ngày; các dump `studio-before-*` chụp trước mỗi lần cập
nhật và `studio-initial.dump` không bị vòng dọn này xoá, dọn tay khi cần.

**Chưa đẩy ra ngoài VPS** (chủ dự án hoãn ngày 07/11/2026). Bật bằng cách cấu hình một remote rclone chỉ cho Studio (`rclone
config`, scope `drive.file`, tên `studio-backup`) rồi tạo `/srv/duongsinh-studio/backup.env` (quyền 600) với
`REMOTE=studio-backup:duongsinh-studio`; khi đó script chép lên, kiểm lại, và giữ 30 ngày ở đó. Remote `gdrive-dsc:` đang có
trên VPS thuộc sao lưu của production NocoBase, không dùng chung.

Đã thử khôi phục 07/11/2026: nạp dump hằng ngày vào database tạm `restore_probe` trong container `db`, số bảng và số dòng
`pm_issues`, `ag_runs`, `ds_budgets` khớp bản đang chạy, rồi xoá database tạm.

Khôi phục DB (dừng app trước):

```bash
docker stop <container app>
docker exec -i <container db> pg_restore -U studio -d studio --clean --if-exists < /srv/duongsinh-studio/backups/studio-<ngày>.dump
tar -xzf /srv/duongsinh-studio/backups/storage-<ngày>.tar.gz -C /srv/duongsinh-studio
docker start <container app>
```

Tên container: `duongsinh-studio-tluxoy-app-1` và `duongsinh-studio-tluxoy-db-1` (appName của compose trên Dokploy là
`duongsinh-studio-tluxoy`).

## CLI `ds-studio` nối vào production

Đăng nhập bằng trình duyệt chưa có trên bản này ("offers no browser sign-in"), nên dùng API key: tạo khoá ở trang tài
khoản (hoặc `POST /api/auth/api-key/create`) rồi `ds-studio login --server https://studio.dsc.edu.vn/main --api-key-stdin`.
Trên WSL không có keychain nên khoá nằm ở `~/.ds-studio/config.json` (0600). Cài CLI:
`curl -fsSL https://studio.dsc.edu.vn/main/api/agents/dist/installScript | sh -s -- --token <download token>` (token lấy
khi bấm cài CLI trong ứng dụng).

## GitHub App (S5.2)

Studio kết nối GitHub bằng một GitHub App riêng (PR và checks cập nhật ngay qua webhook, mỗi run nhận token chỉ cho repo
của nó, hết hạn trong 1 giờ). Kết nối PAT cũ vẫn chạy song song; khi App đã cài và chạy ổn thì gỡ PAT. Chủ dự án tự làm,
đăng nhập GitHub bằng tài khoản `covuaduongsinh`:

1. Mở `https://studio.dsc.edu.vn/main/settings/git` → thẻ **GitHub App** → (để trống "Organization" nếu App thuộc tài
   khoản cá nhân `covuaduongsinh`) → **Create GitHub App**.
2. Trang GitHub "Create GitHub App for covuaduongsinh" mở ra, tên và quyền đã điền sẵn → **Create GitHub App**. GitHub đưa
   về Studio; thẻ hiện App mới với "Not installed". (Tên phải chưa ai dùng trên GitHub; nếu bị trùng, sửa tên ngay trên
   trang GitHub.)
3. Bấm **Install on repositories** → chọn **Only select repositories** → `duongsinh-studio-sandbox` và `duongsinh-nocobase`
   → **Install**. GitHub đưa về Studio; thẻ hiện "Installed on covuaduongsinh", không có dòng "Missing permissions".
4. Ở thẻ **Repositories**, liên kết các repo qua kết nối App (chọn kết nối App, gõ `owner/name`), rồi ở trang từng
   project gắn repo đó (mục Code). Production chưa có kết nối PAT nào, nên **không cần** tạo PAT ở đây. (Studio chưa có
   thao tác chuyển một repo đã liên kết qua PAT sang App; trên máy dev, repo cũ qua PAT cứ để nguyên.)
5. Kiểm: mở hoặc cập nhật một PR thử trên sandbox → dòng "Webhook: Last delivery …" trong thẻ App đổi trong vài giây.

Studio không bao giờ hiện lại khoá riêng hay webhook secret; chúng nằm trong DB, niêm phong bằng `SECRETS_KEYS`. Mất
`SECRETS_KEYS` thì phải tạo App mới. Địa chỉ webhook là `https://studio.dsc.edu.vn/main/api/webhooks/github/connections/<id>`
(lấy từ `APP_PUBLIC_ORIGIN`); đổi tên miền thì phải sửa Webhook URL trong cài đặt App trên GitHub.

## Phát hành (S5.4–S5.5)

- Trang **Releases** (`/main/releases`) và **Hosted environments** (`/main/environments`). Production chỉ **ghi nhận**: chủ
  dự án deploy NocoBase 2 bằng Dokploy như cũ, rồi vào Releases → version → **On production** (ghi chú bắt buộc).
- Tag `v*` trên `main` của repo được đọc ngay khi GitHub App báo `push` tag, hoặc trong vòng 10 phút (poll). Nút **Read tags**
  (quản trị) đọc lại và đếm lại issue của mọi version.
- App id dùng để duyệt đề nghị lên production mặc định là `<tên repo>-production` (ví dụ `duongsinh-nocobase-production`);
  đổi qua `PUT /api/deploys/repositories/{id}/apps/production`.
- Nhắc trong Inbox mỗi ngày khi có issue đã merge hơn 3 ngày mà chưa lên production.

## Preview và staging (S5.6)

- **Cấu hình** (tab Environment của compose `studio`): `DOKPLOY_URL=https://dokploy.dsc.edu.vn`, `DOKPLOY_API_KEY`
  (khoá Dokploy, bí mật), `DOKPLOY_PROJECT_ID=UXiVqm4NRAAJO1HTFNo9I`. Thiếu một trong ba → Studio từ chối mọi thao tác
  preview (không làm giả).
- **Compose do Studio tạo** trong project `duongsinh-studio`: `nocobase-preview` (https://preview.dsc.edu.vn) và
  `nocobase-staging` (https://staging-nocobase.dsc.edu.vn). Mỗi lần dựng Studio **xoá compose cũ kèm volume** rồi tạo mới
  (id mới ghi vào `dsPreviewSlots`). Đừng sửa tay hai compose này; sửa ở `server/previews/compose.ts`.
- **Kích hoạt:** PR của `duongsinh-nocobase` có nhãn `preview` → workflow `preview.yml` build plugin → Studio dựng. Push vào
  `main` → staging. Admin dựng lại staging: `POST /api/previews/staging {repositoryId}`.
- **Chỗ bị kẹt:** Releases → Previews → "Gỡ xuống" (PR đang chiếm chỗ) để PR chờ tiếp theo lên; hoặc đóng PR / bỏ nhãn.
  Nếu compose bị xoá tay trong Dokploy, Studio bỏ qua và tạo lại ở lần dựng sau.
- **Đăng nhập preview:** trang có cổng basic auth (người dùng `preview`/`staging`, mật khẩu sinh mỗi lần dựng); sau đó
  đăng nhập NocoBase bằng `preview-root@example.com` + mật khẩu sinh. Cả hai xem ở Releases → Previews → "Thông tin đăng
  nhập" (chỉ người sửa được issue, admin, owner).
- **Chi phí RAM:** preview chạy ≈ 1–1,4 GB (app 1 GB + DB 384 MB + setup 512 MB lúc dựng); staging tương tự và chạy
  thường trực. Studio không dựng khi VPS còn < 1,2 GB trống; production > 3 s thì preview bị dừng.
- **Tắt hẳn preview:** xoá `DOKPLOY_API_KEY` khỏi Environment của `studio` rồi Deploy; xoá tay 2 compose nếu còn.

## Runner

**Runner dùng chung trên VPS (S5.3, 03/11/2026):** `vps-studio-runner` (trust `team`, 1 lượt mỗi lần) chạy dưới user hệ
thống `studio-runner` (không sudo, không nhóm `docker`, mật khẩu khoá; `loginctl enable-linger`). Giới hạn cả user bằng
`systemctl set-property user-1002.slice MemoryMax=2G MemorySwapMax=1G CPUQuota=150%`. Claude Code + Codex cài bằng
`npm -g` với prefix `~/.local` của user đó; chủ dự án tự đăng nhập (`ssh root@…` → `su - studio-runner` → `claude`,
`codex login --device-auth`). Connector claude.ai bị tắt cho user này (`~/.claude/settings.json` →
`env.ENABLE_CLAUDEAI_MCP_SERVERS=false`). Dịch vụ: `systemctl --user` `nocobase-runner.service` (khi `su -` phải đặt
`XDG_RUNTIME_DIR=/run/user/1002 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1002/bus`). Sau khi đăng nhập công cụ phải
`systemctl --user restart nocobase-runner` thì runner mới báo `ready`. Không để khoá/token nào khác trong user này.
Nâng runner: sau khi server lên bản mới, chép thư mục phiên bản và `manifest.json` từ `storage/runners/dist/stable/nocobase-runner` của máy dev vào cùng đường dẫn trên VPS (chủ sở hữu 1000:1000); runner tự cập nhật qua heartbeat, hoặc chạy `nocobase-runner update`.

**Runner cá nhân trên máy dev** (`may-dev-duongsinh-prod`, ownerOnly): chỉ giữ **một** đăng ký cho mỗi ứng dụng cùng tên;
đăng ký sang server khác phải `--force` rồi `nocobase-runner stop` / `start`. Hiện đang dừng (VPS lo việc).

## Tài nguyên đo được

Xem `docs/plans/2026-11-02-khao-sat-vps-s5.md` (repo `D:\code\nocobase`) cho số liệu VPS trước/sau khi triển khai.

## Email và web push (U7)

Đặt trong biến môi trường của compose studio qua Dokploy, giá trị bí mật giữ ở file trong `~/code/secrets/`, không commit:

| Biến | Ý nghĩa |
| --- | --- |
| `WEB_PUSH_PRIVATE_KEY` | Khoá VAPID P-256, 32 byte hex, sinh một lần và **không đổi**: đổi khoá thì mọi thiết bị phải đăng ký lại |
| `WEB_PUSH_CONTACT` | `mailto:` liên hệ gửi kèm web push |
| `STUDIO_EMAIL_ENABLED` | `true` để bật email; để trống thì không gửi gì |
| `STUDIO_SMTP_USER` | Tài khoản Gmail gửi đi |
| `STUDIO_SMTP_PASSWORD` | App Password của tài khoản đó |
| `STUDIO_SMTP_FROM` | Địa chỉ người gửi |

Kênh SMTP mặc định là `smtp.gmail.com:465`. Cần `APP_PUBLIC_ORIGIN` đúng để liên kết trong email có đủ đường dẫn. Lần gửi thật
đầu tiên phải hỏi chủ dự án trước và chỉ gửi tới chủ dự án.

