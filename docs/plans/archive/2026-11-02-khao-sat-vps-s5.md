# Khảo sát VPS cho S5.0 — 02/11/2026

> Bước S5.0 của `2026-11-02-nocobase-studio-s5-phat-hanh.md`. Chỉ chạy lệnh đọc qua SSH (`root@217.15.160.118`, khoá
> `id_ed25519` của máy chủ dự án). Không thay đổi gì trên VPS. Không dùng API key Dokploy.

## Số liệu (khoảng 09:56, giờ VPS)

| Mục          | Giá trị                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Hệ điều hành | Ubuntu 24.04.4 LTS, kernel 6.8, KVM                                                                |
| CPU          | 4 nhân; load average 10,9 / 13,3 / 13,3 (≈ 3× số nhân, kéo dài)                                    |
| RAM          | 7,8 GiB tổng, **1,3 GiB available**, 162 MiB free                                                  |
| Swap         | 15 GiB, **10 GiB đang dùng** (vmstat: có swap-in liên tục, CPU idle 6–15 %)                        |
| Ổ đĩa        | 145 GB, đã dùng 101 GB (70 %), còn 45 GB                                                           |
| Docker       | 29.6.1, Swarm active, **94 container đang chạy**                                                   |
| Dokploy      | `dokploy/dokploy:v0.30.2` + `dokploy-postgres` (postgres:16)                                       |
| DNS          | `studio.dsc.edu.vn` và `dokploy.dsc.edu.vn` đều trỏ về 217.15.160.118 (bản ghi `studio` đã có sẵn) |

## Container theo nhóm (đếm theo tên compose của Dokploy)

- 5 stack giống nhau, mỗi stack 11 container (`…-studio-1`, `…-meta-1`, `…-realtime-1`, `…-functions-1`, `…-db-1`…: dạng
  bộ Supabase tự host): `compose-hack-auxiliary…`, `compose-generate-…`, `compose-connect-optical…`,
  `compose-compress-multi…`, `compose-reboot-neural-matrix…` → 55 container.
- `compose-parse-mobile-card…` (noteriv: api, postgres, pdf, garage, redis…) 9 container.
- `compose-navigate-online-bus…` (api, rabbitmq, postgres…) 7 container.
- `nocobase-dsc-…` (production NocoBase 2): 2 container; app ≈ 246 MiB đang ở RAM.
- Khác: `hermes` (≈ 764 MiB, lớn nhất), `erpnext-queue` (CPU 64 % lúc đo), `goclaw-prod` (2), `javis`, `typstify-web`,
  `app-copy-primary-feed`, `rclone` (đang chạy, có thể là sao lưu).

## Dọn lần 1 (10:05, chủ dự án duyệt): tắt ERPNext

- `docker stop` 8 container: `erpnext-frontend|queue|websocket|scheduler|backend` (compose Dokploy
  `compose-navigate-haptic-bus-wjq6xj`) và `erpnext-redis-queue|redis-cache|db` (compose `erpnext-prod`). Không xoá
  container/volume. Lưu ý: restart policy là `always`, nên khởi động lại Docker hay reboot VPS sẽ bật lại; muốn tắt hẳn thì
  bấm Stop trong Dokploy.
- Đo lại: RAM available 1,3 → **1,6 GiB**, swap vẫn 10 GiB, load 16 / 15 / 14; production `nocobase.dsc.edu.vn` trả 200
  trong 0,42 s.
- Tải CPU chủ yếu đến từ rất nhiều tiến trình ngắn (`runc`, `pg_isready`, `curl`, `sh`, `beam.smp`): health check của
  ~90 container (5 bộ Supabase × 11) chạy liên tục, cộng `hermes` và `javis`.

## Sau S5.1 (10:48): Studio chạy trên VPS

Chủ dự án chọn "dùng tạm VPS hiện tại". Project Dokploy mới `duongsinh-studio` → compose `studio` (appName
`duongsinh-studio-tluxoy`): `app` (node:24.15.0-bookworm-slim, bản phát hành `ad56193` build trên máy dev, giới hạn
1536 MiB / 1,5 CPU) + `db` (postgres:16-alpine, 384 MiB / 0,5 CPU). Không build trên VPS; không đụng project khác.

| Thời điểm                       | RAM available | Swap dùng  | Load (1/5/15)      | `nocobase.dsc.edu.vn` |
| ------------------------------- | ------------- | ---------- | ------------------ | --------------------- |
| 10:39 trước deploy              | 1 534 MiB     | 10 234 MiB | 10,4 / 12,3 / 13,2 | 200, 0,08–0,10 s      |
| 10:41 vừa khởi động (migration) | 1 492 MiB     | 10 520 MiB | 20,3 / 16,3 / 14,7 | 200, 0,06–0,09 s      |
| 10:48 ổn định                   | 1 487 MiB     | 10 497 MiB | 11,9 / 12,9 / 13,5 | 200, 0,05–0,07 s      |

Studio dùng ≈ 250 MiB (app) + 76 MiB (db) khi rảnh; `/srv/duongsinh-studio` 475 MB trên đĩa.

## Kết luận

- **Cổng của S5.0 không qua:** RAM available 1,3 GiB < ngưỡng 3 GiB của kế hoạch; máy đã dùng 10 GiB swap và tải CPU gấp
  ba số nhân. Thêm Studio (≈ 2 GiB + Postgres 0,5 GiB), runner agent (≈ 1–3 GiB khi chạy) hay preview NocoBase 2
  (≈ 1–1,5 GiB mỗi cái) lên máy này sẽ làm chậm thêm production `nocobase.dsc.edu.vn`.
- Ổ đĩa và DNS không phải vấn đề.
- Phương án (chờ chủ dự án chọn): (1) dọn các stack không còn dùng (5 bộ Supabase, erpnext, …) rồi đo lại; (2) nâng VPS
  lên ≥ 16 GB RAM; (3) VPS riêng cho Studio + runner + preview; (4) tạm giữ Studio trên máy dev, làm trước S5.4–S5.5 (chỉ
  code), dời S5.1/S5.3/S5.6.
