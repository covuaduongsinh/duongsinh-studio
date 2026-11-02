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

## Quay lui

Đặt lại `STUDIO_RELEASE` về sha cũ (thư mục cũ còn trong `releases/`) và Deploy. Nếu bản mới đã chạy migration làm
đổi schema, khôi phục bản sao lưu DB chụp trước khi cập nhật (mục dưới) rồi mới chạy bản cũ. Giữ ít nhất 2 bản phát hành
gần nhất trong `releases/`.

## Sao lưu và khôi phục

Dokploy chưa có đích sao lưu (S3) nào, nên chưa bật sao lưu tự động của Dokploy. Hiện dùng cron trên VPS (chỉ cho project
này), giữ 14 bản:

- `/etc/cron.d/duongsinh-studio-backup` chạy `/srv/duongsinh-studio/backup.sh` lúc 02:30 hằng ngày;
- `pg_dump -Fc` từ container `db` → `/srv/duongsinh-studio/backups/studio-<ngày>.dump`, cùng `storage-<ngày>.tar.gz`;
- bản sao lưu nằm cùng máy với dữ liệu: khi có đích S3/Drive thì thêm bước đẩy ra ngoài (việc còn mở).

Khôi phục DB (dừng app trước):

```bash
docker stop <container app>
docker exec -i <container db> pg_restore -U studio -d studio --clean --if-exists < /srv/duongsinh-studio/backups/studio-<ngày>.dump
tar -xzf /srv/duongsinh-studio/backups/storage-<ngày>.tar.gz -C /srv/duongsinh-studio
docker start <container app>
```

Tên container xem bằng `docker ps --filter label=com.docker.compose.project=<appName của compose>`.

## Runner

Không có runner trên VPS (S5.3 hoãn vì VPS thiếu RAM). Runner cá nhân trên máy dev đăng ký vào server này bằng token
lấy ở trang **Runtimes → Add runtime** của `https://studio.dsc.edu.vn/main/`:

```bash
nocobase-runner register --server https://studio.dsc.edu.vn/main --token <token> --name may-dev-duongsinh-prod
```

Runner giữ được nhiều đăng ký (`nocobase-runner status` liệt kê "registrations"), nên đăng ký thêm production không bỏ
đăng ký dev; `nocobase-runner unregister` để gỡ một cái. Sau khi runner online mới tạo agent (Agents → Add agent).

## Tài nguyên đo được

Xem `docs/plans/2026-11-02-khao-sat-vps-s5.md` (repo `D:\code\nocobase`) cho số liệu VPS trước/sau khi triển khai.
