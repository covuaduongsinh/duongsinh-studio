# Khảo sát chỉ đọc trên VPS: NocoEdu production (12/11/2026)

Làm theo yêu cầu của chủ dự án trong phiên lập kế hoạch V, để V5.4 (nhận nuôi NocoEdu) không phải suy đoán. Chỉ chạy lệnh đọc qua SSH
(`ls`, `stat`, `cat` file compose, `docker ps`, một truy vấn `SELECT` đếm/kích thước trong container DB). **Không** sửa, dừng, khởi động hay xoá gì;
không đọc giá trị biến môi trường (chỉ liệt kê **tên** biến); không chạm `nocobase.dsc.edu.vn`; không gọi API Dokploy.

## 1. NocoEdu production hiện chạy thế nào

| Mục             | Kết quả                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compose Dokploy | `/etc/dokploy/compose/compose-synthesize-online-firewall-897jlk/` (tên Dokploy tự đặt, **không** phải `nb3-*`), tạo/sửa lúc 01:07 ngày 12/11/2026. Project Dokploy: `nocoedu` (theo chủ dự án).                   |
| Dịch vụ         | `app` (ảnh `nocoedu-app:main`, **build từ** `https://github.com/covuaduongsinh/nocoedu.git#main`, `mem_limit 1536m`, `cpus 1.5`, healthy) và `db` (`postgres:16-alpine`, `384m`, `0.5` CPU, healthy). Chạy 2 giờ. |
| Cơ sở dữ liệu   | **PostgreSQL**, DB `nocoedu`: 15 MB, 71 bảng (22 bảng có dữ liệu). Volume `…_nocoedu-pg` 70 MB.                                                                                                                   |
| Lưu trữ         | Volume `…_nocoedu-storage` 48 MB (`/app/storage`, chứa `config.yml`).                                                                                                                                             |
| Tên miền        | `nocoedu.dsc.edu.vn` (Traefik, `letsencrypt`, thêm router riêng cho WebSocket `/main/ws`, ưu tiên 1000). `APP_BASE_PATH=/main`.                                                                                   |
| Biến (chỉ tên)  | `APP_NAME, COMPOSE_PROJECT_NAME, APP_PUBLIC_ORIGIN, DB_DATABASE, DB_USERNAME, DB_PASSWORD, SECRETS_KEYS, INITIAL_ADMIN_*, LARK_APP_ID, LARK_APP_SECRET, LARK_DOMAIN, DOCKER_CONFIG`.                              |
| Lark            | `LARK_APP_ID`/`LARK_APP_SECRET`/`LARK_DOMAIN` nằm trong `environment` của service **`app`** (web) — đúng điều B#6 cảnh báo.                                                                                       |
| Bản cũ          | `/srv/nocoedu-dsc/` (compose cũ, `releases/`, `storage/edu.sqlite` 5,6 MB sửa lần cuối **09/11 10:01**, hai script đối soát dữ liệu) — không còn tiến trình nào chạy từ đây.                                      |

Kết luận: NocoEdu đã chuyển từ SQLite (`/srv/nocoedu-dsc`) sang compose Postgres do Dokploy quản **trong ngày 12/11**. Với V5.4, đích "nhận nuôi" khác dự kiến: ảnh **build từ source GitHub**,
không phải `dist` archive qua plugin `releases`; compose mang tên tự đặt của Dokploy.

## 2. Phát hiện cần xử lý (không nằm trong báo cáo B)

1. **Dữ liệu Postgres production của NocoEdu hiện không có bản sao lưu nào.** Cron `0 21 * * * nocoedu-dsc-backup.sh` vẫn chạy mỗi đêm và báo "thành công",
   nhưng script sao lưu **`/srv/nocoedu-dsc/storage/edu.sqlite` (bản cũ, đứng yên từ 09/11)**, ~860 KB, không phải DB Postgres đang chạy. Backup của Studio (`backup.sh`) chỉ lấy DB Studio.
   S1 thật, nặng hơn B#14 (B#14 viết cho app do Studio quản).
2. **Mọi `.env` của Dokploy là `0644`, và `/etc/dokploy` là `0777`.** 17 file `.env` (kể cả NocoEdu, Studio, `nocobase-dsc`) đọc được bởi mọi user trên máy, tức cả `studio-runner` (uid 1002) — chứa `DB_PASSWORD`,
   `SECRETS_KEYS`, `LARK_APP_SECRET`, mật khẩu quản trị ban đầu. Trả lời mục "chưa kiểm" của B §5 (quyền file `.env`): **0644**. Mâu thuẫn quy tắc "không để khoá/token nào khác trong user runner"
   (`docs/trien-khai-vps.md`). **Sửa quyền trước khi repo này được công khai.**
3. **rclone đã có sẵn trên VPS** với remote `gdrive-dsc`, `dropbox`, `studio-backup`; các app khác đã đẩy sao lưu lên `gdrive-dsc` hằng đêm. "rclone chưa bật" (K0.3/M5) có thể chỉ là Studio chưa dùng remote nào;
   `studio-backup:` có vẻ dành cho Studio. Chưa kiểm remote có ghi được hay đúng thư mục.
4. Tải máy lúc khảo sát: load ≈ 53, RAM khả dụng ≈ 3,0 GiB / 11,96 GiB, đĩa `/` 64% (71 GB trống) — khớp M4.1.

## 3. Đề nghị (chờ chủ dự án đồng ý, vì đều là ghi trên VPS)

1. **Ngay, ngoài kế hoạch V:** một lần `pg_dump -Fc` DB `nocoedu` vào `/srv/backups/nocoedu-dsc/` (0600) và sửa `nocoedu-dsc-backup.sh` dump Postgres thay vì SQLite (giữ 14 ngày local, đẩy `gdrive-dsc`). Việc ~15 phút; không đổi gì ở ứng dụng.
2. `chmod 600` các `.env` của Dokploy và `chmod 755 /etc/dokploy` — **kiểm trước** Dokploy có ghi lại quyền khi deploy (có thể cần umask hoặc hook).
3. V5.4 đổi thiết kế (xem `docs/plans/2026-11-12-studio-thuan-tien-V.md`, V5.4) thay vì tạo compose `nb3-nocoedu` mới có volume trống.
