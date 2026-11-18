# Kế hoạch: đăng ký NocoEdu thành App NocoBase 3 do Studio quản lý (DS-60)

Trạng thái: **CHỜ CHỦ DỰ ÁN DUYỆT**. Bước 0 chỉ đọc: chưa chạy lệnh nào trên VPS, chưa tạo gì trong Dokploy hay Studio.
Không có bí mật hay dữ liệu cá nhân trong file này.

Đã đọc: `.agents/rules/duongsinh-studio.md`, nhật ký NocoLMS (đặc biệt mục 14), `docs/xem-thu-app-nb3.md`,
`docs/trien-khai-vps.md`, `docs/chenh-lech-upstream.md` §33, `server/releases/dokploy-driver.ts` và `nb3-compose.ts`,
`docs/lark/nhap-production.md`, `docs/edu-giai-doan-1.md`, `docs/nguon-goc.md`, `package.json` và README của repo nocoedu
(`D:\code\nocoedu`, NocoBase template beta.89, cùng bản với Studio).

## 0. Mục tiêu và kết quả cần đạt

`ds-studio app list` thấy `nocoedu`; agent Studio chạy được `import-lark --dry-run` (chỉ báo số đếm) trên một App đã đăng
ký; sau đó triển khai được các bản mới qua Studio. Gỡ chặn DS-60.

## 1. Trả lời các câu (a)–(g)

### a) NocoEdu production hiện chạy ở đâu

**Không suy ra được từ tài liệu, cần anh trả lời** (mục 4, câu Q1). Những gì tài liệu cho biết chắc:

- Chạy bằng **Dokploy** (docs/lark/nhap-production.md: "Dokploy, tab Environment", `docker exec`, `docker cp`).
- Database là **PostgreSQL trong một container riêng** (hướng dẫn `pg_dump` ở "container PostgreSQL"); đã được đối chiếu với
  production ngày 12/11/2026 nên đang có dữ liệu thật.
- Image app là `node:24-bookworm-slim`: **không có `curl`, không có bộ chứng chỉ CA** (đã gây `spawnSync curl ENOENT` và
  `x509: unknown authority` ngày 12/11/2026).
- Có học viên thật: lệnh nhập có quy tắc "ghép" học viên đã có, và mục "Đã nhập trước giai đoạn 3" cho biết **đã từng
  `--commit`** trên production (khoá `lark:ph:*`, `lark:sodu:*`).

Không biết: máy nào (cùng VPS `217.15.160.118` hay máy khác), tên miền, tên project/compose Dokploy, phiên bản Postgres,
kích thước DB, ai đang dùng hằng ngày (HLV điểm danh).

### b) Đăng ký App mới hay chuyển production vào

Đồng ý với đề xuất: **dựng App MỚI `nocoedu` cạnh production cũ, nạp bản sao dữ liệu, kiểm xong mới chuyển tên miền.**
Lý do: driver `dokploy` chỉ chạm compose tên `nb3-*` do Studio ghi vào `dsNb3Apps`; nó không "nhận" compose có sẵn
(`ensureRow` luôn tạo compose mới). Không có đường nào chuyển compose cũ vào mà không đụng project Dokploy khác.

Hệ quả: production cũ **không bị đụng** cho tới bước chuyển tên miền; quay lui = trỏ lại tên miền.

### c) Lưu trữ và RAM

**Cần PostgreSQL** (dữ liệu thật, nhiều người ghi điểm danh đồng thời, production hiện đã là Postgres, migration NocoEdu
chỉ mới kiểm trên SQLite nên preview cũng nên chạy Postgres để bắt lỗi sớm). Driver sinh `postgres:16-alpine` (384 MiB, 0.5 CPU,
volume `pgdata`) + mật khẩu ngẫu nhiên đã niêm phong. **Cần xác nhận phiên bản Postgres của production cũ** để `pg_restore` không
lệch (Q2).

RAM (số đo 08/11/2026: 11,96 GiB tổng, khả dụng ≈ 3,0 GiB; Studio 243 MiB lúc rảnh, giới hạn 1,5 GiB; NocoLMS ≈ 212 MiB;
runner trần 2,5 GiB):

| Thành phần                       | Giới hạn | Thường dùng (ước)    |
| -------------------------------- | -------- | -------------------- |
| App `nocoedu` (nb3-nocoedu-app)  | 1 GiB    | 0,25–0,6 GiB         |
| `nb3-nocoedu-db`                 | 384 MiB  | 0,07–0,15 GiB        |
| Service init (chạy một lần)      | 64 MiB   | 0                    |
| **Thêm vào VPS khi chạy**        | ≈ 1,4 GiB trần | **≈ 0,35–0,75 GiB** |

Với khả dụng ≈ 3,0 GiB: thêm NocoEdu còn ≈ 2,2–2,6 GiB lúc runner rảnh; **khi runner chạy việc nặng (trần 2,5 GiB) còn ≈ 0**,
dưới ngưỡng 1,2 GiB. Khuyến nghị: không chạy deploy/import khi runner đang `running`; giữ nguyên giới hạn runner. **Phải đo
lại bằng `docker stats` sau lần chạy thật đầu tiên** (số trên là ước lượng từ NocoLMS, chưa đo NocoEdu).

**Phát hiện chặn (quan trọng): `maxApps` đếm toàn cục.** `capacityProblem()` lọc `store.list()` (mọi App, mọi môi trường) và
so với `maxApps` của môi trường đang deploy (tối đa **2**). Hiện NocoLMS chạy. Nếu bật `nocoedu` production (chạy thường
trực) thì **không còn chỗ cho preview của bất kỳ app nào**, và preview NocoEdu không bật được khi NocoLMS còn chạy.
NocoLMS tự dừng sau 30 phút nên thường vẫn chạy được, nhưng production `nocoedu` thì không tự dừng. Cần quyết định ở Q4.

### d) Chạy lệnh trong App, và đưa `LARK_*` vào

**Thực trạng:** driver không có `exec`, không có log (`logs.available = false`), runner dùng chung **không** thuộc nhóm
`docker` (cố ý). Vậy agent Studio hiện **không có đường nào** chạy `node dist/cli/index.js app edu import-lark`. Đây là
nguyên nhân gốc của việc DS-60 bị chặn, không chỉ là chưa đăng ký.

Phương án (đề xuất **D2** cho agent, **D1** làm cầu nối ngay):

- **D1 – chủ dự án/ops chạy tay** theo `docs/lark/nhap-production.md` (SSH hoặc terminal Dokploy `docker exec`), kèm hai
  vá lỗi đã biết: cài `lark-cli` trên host rồi `docker cp`, và `SSL_CERT_FILE` trỏ vào CA của host. Mất khi redeploy. Dùng để
  không chờ PR driver; không cần code mới.
- **D2 – "job" một lần trong compose (PR Studio, đề xuất):** thêm service `<name>-job` vào `nb3ComposeFile`, `restart: "no"`,
  `profiles: [job]` (không chạy theo `up -d` thường), cùng image/mount với app, thêm mount chỉ đọc `ca-certificates.crt` của
  host và thư mục `tools/lark-cli` đã cài sẵn một lần trên host. Studio gọi Dokploy chạy job (cần kiểm Dokploy API có chạy
  được profile; nếu không thì dùng service luôn có mặt với `command` đọc `NB3_JOB` rồi thoát). Job ghi **báo cáo chỉ có số
  đếm/mã lỗi** ra `<hostDir>/reports/<jobId>.json` (đường này Studio đọc được vì cùng thư mục `dataDir`) và agent đọc file
  đó, không cần log. Chỉ cho phép danh sách lệnh cố định: `import-lark --dry-run` (và `--commit` kèm xác nhận người, mục f).
- **D3 – route quản trị trong chính NocoEdu** chạy import: bị loại (mở thêm bề mặt tấn công trên ứng dụng dữ liệu trẻ em,
  `auth.required()` không thay thế được kiểm soát chạy lệnh vận hành).

**Biến `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_DOMAIN`:** đưa vào **biến của App** trong Studio (đi vào `.env` của
compose ở Dokploy, cùng chỗ giữ bí mật của Studio). Tồn đọng cần xử lý trong PR D2: hiện driver đưa **mọi** biến App vào
`env_file` của cả service `app`, tức app web cũng nhìn thấy secret Lark. Đề xuất: biến tiền tố `JOB_` hoặc danh sách tên
chỉ gắn vào service `job`. Quy tắc: nhập secret qua giao diện (không qua dòng lệnh/log/PR), không `echo`, kiểm bằng độ dài
hoặc có/không; `lark-cli` đã chỉ nhận danh sách biến cho phép nên không lộ `LARK_APP_SECRET` hay mật khẩu DB. **Cần kiểm
Studio có niêm phong biến App không** (chưa xác minh trong mã); nếu không thì giữ secret ở tab Biến của Dokploy.

### e) Sao lưu và quay lui

- **Trước mỗi deploy/import:** `pg_dump -Fc` từ container `nb3-nocoedu-db` + tar volume `storage`. Studio không `exec`
  được, nên cần **script trên VPS** (mở rộng `deploy/dokploy/backup.sh`, cron 03:15 + chạy tay trước thao tác), chủ dự án cài
  một lần. Dump chứa dữ liệu trẻ em: giữ trong `/srv/duongsinh-studio/backups/` (đã có, quyền 600), không đẩy ra repo/ticket.
  Điều kiện cứng trong runbook: chỉ `--commit` khi có bản dump mới (< 1 giờ) và đã `ls -l` thấy không rỗng.
- **Bản phát hành:** giữ ≥ 2 bản trong `/srv/duongsinh-studio/storage/nb3-apps/nb3-nocoedu/<version>`; quay lui code = deploy lại
  version cũ. Driver không tự hoàn tác deploy lỗi (§33 mục 3) và migration không có `down` an toàn sau khi có dữ liệu nên
  **quay lui dữ liệu = `pg_restore --clean --if-exists` bản dump trước** (App dừng trước).
- **Import hỏng:** `--commit` chạy trong **một transaction** (hỏng giữa chừng không ghi gì). Sau khi đã ghi: khôi phục dump;
  tuyệt đối **không dùng `db rollback`** (mất `externalId`, nhập lại sẽ nhân đôi) như tài liệu nhập đã nêu.
- **Chuyển tên miền:** giữ production cũ chạy song song một thời gian; quay lui = đổi lại bản ghi A/router. Dữ liệu mới
  ghi vào App mới trong thời gian đó phải được chép ngược tay, nên **đóng băng ghi** (dừng App cũ) ngay trước lần chép dữ liệu cuối.

### f) Việc CHỦ DỰ ÁN làm tay (khoá API cá nhân không có quyền quản trị)

1. Trả lời các câu ở mục 4 (đặc biệt Q1, Q2, Q3, Q4).
2. Bản ghi A ở Mắt Bão: `nocoedu-preview.dsc.edu.vn` và tên cho App mới (tạm `nocoedu-moi.dsc.edu.vn` cho tới ngày chuyển;
   Traefik tự xin chứng chỉ) → IP VPS đúng của Dokploy (Q1).
3. Trong giao diện Studio (phiên đăng nhập, không dùng khoá API): tạo **môi trường `preview`** (driver `dokploy`,
   `dataDir`/`hostDir` như NocoLMS, `hosts`, `database: postgres`, `maxApps` theo Q4, tự dừng 30 phút) và App `nocoedu-preview`;
   sau đó môi trường **`production`** (protected, approver = chủ dự án, không tự dừng) và App `nocoedu`.
4. Liên kết repo `covuaduongsinh/nocoedu` qua GitHub App "Duong Sinh Studio" (đã cấp All repositories; cần liên kết trong
   Studio) và gán App cho môi trường ở trang repo.
5. Khoá API phạm vi hẹp: chỉ App `nocoedu-preview` (`upload`, `deploy`) lưu thành secret `STUDIO_API_KEY` + `STUDIO_URL` của
   repo nocoedu (xem workflow mẫu `docs/xem-thu-app-nb3.md`). Production: **không** cấp khoá cho CI; deploy production qua giao diện.
6. Trên VPS (một lần): `mkdir`/`chown 1000:1000` thư mục nb3-apps đã có từ NocoLMS (dùng lại); cài `lark-cli` vào
   `/srv/duongsinh-studio/tools/lark-cli`; cài `backup.sh` mở rộng.
7. Nhập secret `LARK_*` vào biến App (qua giao diện).
8. Tự tay duyệt: tạo `production`, mỗi `--commit`, và việc chuyển tên miền.

### g) Thứ tự bật môi trường

`preview` trước, `production` sau; **nhưng dữ liệu của preview là dữ liệu giả** (`APP_SAMPLE_DATA=true`, tài khoản
`@example.invalid`), **không** bản sao dữ liệu thật: preview có tên miền công khai và cổng bảo vệ yếu hơn production, dữ liệu
trẻ em không nên rời production chỉ để thử. Bản sao dữ liệu thật chỉ nạp vào **App `nocoedu` mới (production-candidate)**,
trước khi chuyển tên miền. Hệ quả: `import-lark --dry-run` trên preview chỉ chứng minh đường chạy (Lark đọc được, lệnh
không lỗi, báo cáo chỉ số đếm); bảng "ghép/trùng" có nghĩa chỉ trên bản sao thật. Cần anh đồng ý rõ điểm này (Q5).

## 2. Rủi ro đã nhận diện (từ nhật ký NocoLMS)

| Rủi ro (đã xảy ra với NocoLMS)                          | Phòng cho NocoEdu                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Lỗi chỉ lộ ở deploy thật (biến, hard link, chủ volume)  | Đã sửa trong driver (§33.1); vẫn deploy **preview trước**, coi lần đầu là chạy thử có thể lỗi          |
| Mã nguồn app không build / route thiếu `auth.required()` | NocoEdu có test route; trước deploy chạy **test theo file đổi** + kiểm 401/403, không `pnpm check` toàn repo |
| Biến "chỉ lần khởi động đầu" mất nếu deploy đầu hỏng    | Đặt `INITIAL_ADMIN_*` trước lần deploy đầu; nếu hỏng, xoá DB rỗng của App mới rồi đặt lại (App mới chưa có dữ liệu) |
| In khoá API / ticket ra phiên                           | Mọi lệnh đọc vào biến, không `echo`; `ds-studio login --api-key-stdin`; không dán vào ticket          |
| Gateway 502 khi tải 74 MB                               | Thử lại ticket mới; archive NocoEdu có thể lớn hơn (nhiều plugin): kiểm kích thước                       |
| Image thiếu `curl`/CA                                   | Giải quyết trong D2 (mount CA + công cụ cài sẵn trên host), không cài trong container                  |
| `maxApps` toàn cục                                      | Q4                                                                                                       |

Ràng buộc runner 2,5 GiB: build (`pnpm build --target linux-x64 --node-version 24`, ~vài GiB) **không chạy trên runner**;
build ở GitHub Actions hoặc WSL của chủ dự án. Agent chỉ chạy lệnh theo file đổi (`vitest run <file>`, `tsc -p … `
theo gói), từng lệnh một, tuyệt đối không `pnpm check/lint/test/build` toàn repo.

## 3. Các pha (mỗi pha một PR nhỏ, ghi nhật ký vào `docs/plans/` như NocoLMS)

Mỗi pha bắt đầu và kết thúc bằng: không có run `running`/`dispatched`; **trước khi đổi bản Studio production**: sao lưu DB
(`studio-before-<sha>`), tạm dừng tự lái với lý do `Cập nhật Studio (<sha>)`, chờ khoảng trống, rồi mới đổi `STUDIO_RELEASE`.

| Pha | Việc                                                                                                                                                              | Ai / PR                                    | Cổng duyệt                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| P0  | Duyệt kế hoạch này, trả lời Q1–Q6                                                                                                                                  | Chủ dự án                                  | **Anh duyệt**                      |
| P1  | PR Studio: **job một lần** (D2) + biến chỉ-cho-job + đếm `maxApps` theo môi trường (nếu Q4 chọn) + test với Dokploy giả; cập nhật §33 và `docs/xem-thu-app-nb3.md` | Agent (test theo file), anh duyệt PR       | Anh duyệt PR; đổi bản Studio theo quy trình trên |
| P2  | Việc tay (f.2–f.7): DNS, tạo môi trường `preview` + App, liên kết repo, khoá API hẹp, cài `lark-cli` và `backup.sh` trên host                                      | Chủ dự án                                  | —                                  |
| P3  | PR nocoedu: workflow `preview.yml` (mẫu docs/xem-thu-app-nb3.md), tài liệu cách chạy; build → upload → **deploy preview** (dữ liệu mẫu)                           | Agent, anh duyệt PR + **lệnh deploy**      | Anh nói "deploy preview"           |
| P4  | **`import-lark --dry-run` trên preview** qua job; ghi nhật ký (chỉ số đếm); cập nhật **DS-60**                                                                    | Agent, sau lệnh của anh                    | Anh nói "chạy dry-run"             |
| P5  | Tạo môi trường `production` + App `nocoedu` (tên miền tạm); đóng băng ghi ở bản cũ; `pg_dump` bản cũ → `pg_restore` vào DB mới; deploy bản đã duyệt              | Chủ dự án tạo, agent giám sát              | Anh duyệt từng bước (protected)    |
| P6  | `import-lark --dry-run` trên bản sao thật (đọc kết quả, không `--commit`); Thầy Tường xem bảng so sánh số dư                                                      | Agent + Thầy Tường                         | Anh duyệt                          |
| P7  | Chuyển tên miền, giữ bản cũ N ngày, rồi mới nghỉ production cũ; mọi `--commit`/xoá riêng, mỗi lần một lệnh của anh                                                | Chủ dự án                                  | Anh duyệt                          |

**DS-60** cập nhật sau P4: nêu rõ cách chạy `import-lark --dry-run` trên App đã đăng ký (lệnh job, vị trí báo cáo, ai bấm).

Không làm trong kế hoạch này (khi chưa có lệnh): deploy, import, xoá, động vào VPS, project Dokploy khác, production NocoBase 2.

## 4. Câu hỏi cần anh chốt trước khi tôi bắt đầu P1

- **Q1.** NocoEdu production đang ở máy nào (cùng VPS `217.15.160.118` hay khác)? Tên miền? Project/compose Dokploy tên gì?
  Postgres phiên bản mấy, DB nặng khoảng bao nhiêu, giờ nào ít người dùng nhất?
- **Q2.** Đồng ý **dựng App mới `nocoedu` song song rồi chuyển** (mục b)? Hay anh muốn giữ nguyên production cũ và chỉ dùng Studio
  để chạy `import-lark`/deploy bản mới trên App mới chỉ cho môi trường thử?
- **Q3.** Đồng ý đường D1 làm cầu nối ngay (anh/ops chạy tay `--dry-run` rồi gửi số đếm), trong khi tôi làm D2 để agent tự chạy được?
- **Q4.** `maxApps` toàn cục: (a) nâng thành 3 cho môi trường `production`, nhưng RAM chịu được không (cần anh quyết)? (b) sửa
  driver để App ở môi trường `production` không bị tính vào hạn mức preview? (c) giữ nguyên và chấp nhận tắt NocoLMS khi
  bật preview NocoEdu? Tôi đề xuất (b).
- **Q5.** Preview dùng **dữ liệu mẫu**, không sao chép dữ liệu thật (mục g); bản sao thật chỉ vào App `nocoedu` mới. Đồng ý?
- **Q6.** Bản sao lưu `pg_dump` nằm trên VPS `/srv/duongsinh-studio/backups/` (chưa đẩy ra ngoài, anh đã hoãn ngày 07/11) có chấp
  nhận được cho dữ liệu trẻ em của NocoEdu, hay cần mã hoá/đích riêng?

## 5. Việc kiểm trong P1 (chưa xác minh, không đoán)

- Dokploy API có chạy được service `profiles: [job]` / có `exec` không; nếu không dùng phương án service-đọc-`NB3_JOB`.
- Studio có niêm phong biến App (`secret`) hay lưu rõ; ảnh hưởng nơi nhập `LARK_*`.
- Dung lượng archive NocoEdu và có vượt giới hạn upload 74 MB-hạng đã gặp không.
- Migration của NocoEdu trên PostgreSQL (README ghi mới kiểm trên SQLite): chạy thật lần đầu ở preview Postgres.
