# Nhận nuôi NocoEdu (V5.4)

Quyết định của chủ dự án, 13/11/2026: **giữ compose build từ source** của NocoEdu trên Dokploy. Không chuyển sang `dist` của plugin `releases`, không tạo compose `nb3-nocoedu`, không restore dữ liệu. Playbook `!don-app-nb3 app=nocoedu` gom việc vận hành quanh compose đang chạy.

## Hiện trạng (khảo sát chỉ đọc 12/11, xem `docs/plans/2026-11-12-khao-sat-vps-nocoedu.md`)

| Mục     | Giá trị                                                                           |
| ------- | --------------------------------------------------------------------------------- |
| Compose | `compose-synthesize-online-firewall-897jlk` (project Dokploy `nocoedu`)           |
| Dịch vụ | `app` (ảnh build từ `covuaduongsinh/nocoedu`, nhánh `main`), `db` (`postgres:16`) |
| Volume  | `…_nocoedu-pg` (DB), `…_nocoedu-storage` (`/app/storage`)                         |
| Miền    | `nocoedu.dsc.edu.vn`, `APP_BASE_PATH=/main`                                       |

Chỉ ghi tên, không ghi giá trị biến.

## Việc chỉ chủ dự án làm

1. Xác nhận bản `pg_dump -Fc` hằng đêm (cron `nocoedu-dsc-backup.sh`, đã chuyển sang Postgres ngày 12/11): kích thước hợp lý, `pg_restore -l` thấy `TABLE DATA`, có bản trên Drive.
2. Quyền `.env` của Dokploy (`0644`) và `/etc/dokploy` (`0777`): sửa, sau khi kiểm Dokploy có ghi lại quyền khi deploy.
3. Khoá Lark nằm trong môi trường của dịch vụ web: tách sang kênh job (`docs/lark-cho-dsc.md`).
4. Thư mục SQLite cũ `/srv/nocoedu-dsc/`: xoá khi chủ dự án thấy yên tâm.

## Vì sao Studio không deploy hộ

Compose do Dokploy tự đặt tên và build từ GitHub, không có bản ghi trong `dsNb3Apps`, nên các tính năng của driver (tự dừng khi rảnh, dump trước khi xoá, ngăn đủ RAM) không áp dụng. Nếu sau này đổi sang `dist`: dùng `!noi-app-nb3`, chuyển dữ liệu bằng `pg_dump` rồi restore có bước dừng chờ người, giữ compose cũ dừng 14 ngày.
