# Kế hoạch V: Studio thuận tiện và nhanh — 12/11/2026

> Trạng thái: **chờ duyệt**. Nguồn: hai khảo sát chỉ đọc trên `main` = `20d20d7` (A-giao-dien.md: 24 điểm ma sát giao diện;
> B-van-hanh.md: 23 điểm ma sát vận hành, 12 chỗ tài liệu lệch mã), cộng phiên lập kế hoạch DS-60 trên Orca. Mọi điểm đều có file:dòng
> trong hai báo cáo kèm theo. Tên bước dùng chữ **V** để không trùng U/K/L/M/P/H.

## 0. Kết luận

Studio đã đủ năng lực nhưng **chưa thuận tay**. Ba nhóm bất tiện, theo mức đau giảm dần:

1. **Vận hành app NocoBase 3 còn hở** (nặng nhất, đang chặn DS-60 và việc nhập Lark):
   - Agent **không có cách chạy lệnh trong app đã deploy** (migrate, import, seed) và không đọc được log: driver Dokploy không có `exec`,
     `logs()` là stub, runner không thuộc nhóm docker. `status()` chỉ đọc bảng, container chết vẫn báo "running" và vẫn chiếm suất.
   - **Bí mật chảy sai chỗ**: compose app chỉ có một service nên biến App nào cũng vào container web; đưa `LARK_APP_SECRET` vào là lộ.
     Regex quét bí mật không bắt dạng `LARK_APP_SECRET=`, `DB_PASSWORD=`. Khoá CI Studio cấp có quyền ghi **mọi** App, 365 ngày.
   - **maxApps đếm toàn cục** (production chiếm suất preview), trần cứng 2, không có cổng RAM cho app NB3; "tự dừng khi rảnh" thực ra là
     dừng sau N phút kể từ lúc bật.
   - **Sao lưu bỏ sót app**: `backup.sh` chỉ dump DB Studio; volume Postgres của từng app NB3 (NocoEdu có dữ liệu thật) không được sao lưu,
     và vẫn chưa đẩy ra ngoài VPS.
   - **Đăng ký app mới ~12 bước tay** (DNS, Dokploy, GitHub, Studio UI, JSON môi trường gõ tay, hai mẫu workflow lệch nhau); **app đã chạy
     sẵn (NocoEdu) không có đường "nhận nuôi"**.
   - **Lark**: repo chưa có gì về lark-cli; bản CLI cần OAuth trình duyệt nên không hợp runner headless; playbook `!nhap-lark` trỏ tới test
     không tồn tại; hai playbook khác ghi lệnh `pnpm nocobase app:test` không có thật và tiêu chí `pnpm build/typecheck` trái luật runner.
2. **Giao diện khó theo dõi trên điện thoại**: 19 mục menu; trang chủ chỉ gom quyết định trên việc (bỏ sót chat cần trả lời, phát hành chờ);
   `/my-issues` khung chia đôi cố định `w-80` không có nhánh mobile; trang việc 10 khối dọc, diễn biến tách 4 nơi, "Cần bạn" không ghim;
   hộp thoại Tạo công việc **mặc định tab Dự thảo AI** nên lệnh dài bị tách thành nhiều việc (đã xảy ra DS-25…DS-56); ~20 chuỗi dịch máy
   ("Đại tướng", "Chia tay lần nữa", "chạy cưỡng chế"), 3 bộ từ cho cùng một trạng thái.
3. **Chậm**: mọi hook poll 15/30/60 giây dù plugin có realtime (`pm:changes`, `agents:runs:<id>`); `refetchOnWindowFocus:false` nên mở lại
   PWA thấy số cũ tới 60 giây; `decisionsOn` chạy 2 truy vấn × 50 việc cho **mỗi** lần gọi 4 endpoint; layout import tĩnh toàn bộ panel chat
   (~3.000 dòng) vào bundle đầu, không `lazy()`. Về phía việc: 5–7 lượt nối tiếp trên 1 runner, mỗi lượt `pnpm install` lại.

Ngoài ra: hai checkout (Orca trên `D:\` và WSL) từng gây CRLF và build thiếu native Linux; không `.gitattributes`; 12 chỗ tài liệu nói khác mã
(ví dụ "chưa có UI tạo khoá" trong khi đã có; AGENTS.md nhắc `cli/commands/` không tồn tại; không ghi NocoEdu production ở đâu).

## 1. Các bước

### V0 — Sửa nhanh, không cần thiết kế (~1,5 ngày, làm trước)
1. Tạo công việc: đặt `IssueCreationModeContext = 'manual'` để tab **Thủ công** là mặc định; tab Dự thảo AI chỉ hiện khi người dùng chọn. (0,25)
2. `refetchOnWindowFocus: true` cho các query trang chủ, việc, hộp thư; mở lại PWA là tươi. (0,25)
3. Regex bí mật thêm dạng `TÊN_BIẾN=giá-trị` cho `*_SECRET`, `*_PASSWORD`, `*_TOKEN`, `SECRETS_KEYS`, khoá Studio (`ds_…`), khoá Dokploy. (0,25)
4. Sửa 3 playbook: bỏ `pnpm nocobase app:test`; tiêu chí theo file, không `pnpm build/typecheck` trên runner; `!nhap-lark` trỏ đúng lệnh và test có thật. (0,5)
5. Thêm `.gitattributes` (`* text=auto eol=lf`), ghi quy tắc "một working tree trong WSL, Orca mở qua `\\wsl.localhost`" vào `.agents/rules`. (0,25)

### V1 — Trang "Hôm nay" và menu gọn (~2,5 ngày)
1. Trang chủ = **Hôm nay**, 3 khối, một cột trên điện thoại: **Cần tôi** (gộp `inbox/waiting`, `inbox/pending`, `agents/conversationAttention`,
   `attention` phát hành) → **Agent đang làm** (`agentBoard`: việc, lượt, chạy bao lâu, runner) → **Vừa xong / vừa hỏng 24h** (`reports/attention`,
   `taskGroups` nhóm done). Một hook `useToday()` gộp `Promise.allSettled`, invalidate theo realtime.
2. Menu trái còn **8 mục**: Hôm nay · Công việc · Phiên chat · Dự án · Phát hành · Tri thức · Báo cáo · Cài đặt. 11 mục còn lại chuyển vào tab của
   Dự án hoặc nhóm trong Cài đặt. Chỉ đổi `navigation`/`parent`, **giữ `name` và `authz`** để không phải di trú page grant.
3. `/my-issues` và `/issues`: nhánh mobile (`useIsMobile`): một cột, danh sách → chi tiết; bỏ `w-80 shrink-0` cố định.

### V2 — Trang việc đọc được trên điện thoại (~2 ngày)
1. "Cần bạn" ghim trên cùng cùng nút hành động (Nghiệm thu / Gửi lại / Trả lời), header dính có cả ba.
2. **Một dòng thời gian** thay cho 4 khối (Tiến độ, Hoạt động, Lượt chạy, Mã & xem thử): mỗi dòng = ai, làm gì, bao lâu (kể cả thời gian chờ runner,
   CI), kết quả; bấm mới mở chi tiết. Mô tả dài gập lại. Tiêu chí nghiệm thu chỉ hiện khi có.
3. Lưu thời lượng CI vào `dsReportedChecks` và thời gian chờ của run, để dòng thời gian trả lời "việc này chậm ở đâu".

### V3 — Nhanh thật (~2,5 ngày)
1. Realtime thay poll cho việc, hộp thư, trang chủ (subscribe `pm:changes`, `agents:runs:<id>`); giữ poll 60 giây làm dự phòng.
2. `decisionsOn`: tính một lần, cache 15 giây theo người dùng; hoặc route `GET /api/me/today` gộp 4 endpoint thành 1.
3. `lazy()` cho panel chat, lịch sử lượt chạy, react-markdown; đo bundle đầu trước/sau.
4. Runner: cache `node_modules` theo repo (pnpm store dùng chung + giữ workspace giữa các lượt cùng việc); gộp lượt kiểm chứng vào cuối lượt code;
   review chéo chạy song song với CI (merge mới cần cả hai). Đo "giao việc → PR mở" và "số lượt/việc" trên Dashboard trước và sau.

### V4 — Kênh chạy lệnh trong app và bí mật theo job (~5 ngày, nặng nhất, cần duyệt thiết kế)
1. **Kênh job**: daemon nhỏ chạy root trên host (systemd), nghe unix socket mount vào container Studio, chỉ nhận lệnh trong **allowlist**
   (`migrate`, `seed`, `import-lark --dry-run|--commit`, `edu …`) chạy bằng `docker compose run --rm --no-deps <app> node dist/cli/index.js …`, trả
   exit code + log (cắt 20 KB, che bí mật). Studio thêm route `POST /releases/apps/{id}/jobs`, `GET …/jobs/{id}/log`, có quyền riêng
   `rel.apps/operate`, ghi nhật ký. **KHÔNG** mount Docker socket vào Studio, **KHÔNG** exec qua khoá Dokploy (khoá toàn tài khoản).
2. **Bí mật theo job**: biến App có cờ `jobOnly`; compose sinh hai service (`web`, `job`) chỉ `job` nhận biến đó; file `.env` trên đĩa Dokploy
   0600. `LARK_APP_SECRET` đi đường này.
3. `status()` hỏi Docker thật (qua daemon) thay vì chỉ đọc bảng; container chết thì giải phóng suất.
4. Khoá CI theo App: `objects` = đúng App của repo, 90 ngày, nhắc hết hạn vào Hộp thư.
5. Daemon cũng cung cấp `docker logs` cho `logs()` của driver (hết stub).

### V5 — Dung lượng, sao lưu, đăng ký app (~4 ngày)
1. maxApps đếm **theo môi trường**; production không chiếm suất preview; cổng RAM trước khi start (như preview NB2 `MIN_AVAILABLE_MB`);
   "tự dừng" đổi thành dừng sau N phút **không có request** (đếm qua Traefik access log hoặc healthz hit); trang Môi trường hiện RAM còn trống
   và suất đang dùng; sửa seed môi trường cũ (preview NB2 maxApps 2, wildcard).
2. `backup.sh` dump **mọi** Postgres của compose `nb3-*` và tar volume `storage` của từng app; đẩy ra ngoài VPS (rclone, việc K0.3 còn nợ);
   `remove(purgeData)` phải chụp dump trước khi xoá volume; tài liệu rollback dữ liệu app.
3. Playbook **`!noi-app-nb3`** (nối app mới): từ repo đã có CI → tạo môi trường + App + khoá CI theo App + đẩy workflow preview đúng một mẫu
   (hợp nhất hai mẫu đang lệch) → hướng dẫn DNS. Mọi JSON môi trường thành form.
4. Đường **nhận nuôi app đã chạy** (NocoEdu): tạo compose mới do Studio quản lý → `pg_dump`/restore từ compose cũ → kiểm → đổi DNS → tắt cũ.
   Viết thành playbook `!don-app-nb3` có bước dừng chờ người. Ghi rõ NocoEdu production ở đâu vào `docs/`.

### V6 — Lark và dọn tài liệu (~1,5 ngày)
1. Lark: dùng **tenant token** (app credentials) trong lệnh `import-lark` của NocoEdu chạy qua kênh job V4, không cài lark-cli lên runner;
   lark-cli chỉ dùng trên máy Thầy để khảo sát. Ghi giới hạn API Lark (trang ≤500, batch ≤500) vào tài liệu.
2. Sửa 12 chỗ tài liệu lệch mã (danh sách trong B-van-hanh.md §2.8); AGENTS.md bỏ `cli/commands/`; thống nhất một bộ từ trạng thái theo
   `docs/thuat-ngu.md`; đè 20 chuỗi dịch máy; bỏ 2 placeholder tiếng Anh mã cứng.
3. Phát hành Studio qua GitHub Actions theo tag (build `linux-x64` trên CI, `release.sh` trên VPS chỉ tải và đổi `STUDIO_RELEASE`), hết phụ thuộc
   máy dev và WSL.

## 2. Thứ tự và công sức

V0 → V1 → V4 (song song với V2 nếu có 2 người/agent) → V3 → V5 → V6. Tổng ≈ 19 ngày agent, rải 3–4 tuần. Mỗi bước một nhánh, một PR, CI xanh,
cập nhật Tiến độ; production chỉ đổi khi chủ dự án đồng ý, theo `docs/trien-khai-vps.md` (sao lưu, tạm dừng tự lái, bật lại).

**Đo trước, đo sau** (ghi vào Dashboard trước khi bắt đầu V1): thời gian giao việc → PR mở; số lượt/việc; số chạm từ mở app → "cần tôi";
kích thước bundle đầu; thời gian tải trang việc trên 4G.

## 3. Không làm
Docker socket trong container Studio; exec qua khoá Dokploy; OAuth Lark trên runner; thêm runner/vendor model trong đợt này; đổi `name`/`authz`
route; viết lại trang Phiên chat và Hộp thư của plugin (đã mobile + realtime, dùng làm mẫu); tìm kiếm ngữ nghĩa.

## 4. Câu hỏi cần chủ dự án chốt
| # | Câu hỏi | Khuyến nghị |
|---|---|---|
| Q1 | Kênh job (V4): daemon host + unix socket, hay job qua GitHub Actions gọi API Studio? | Daemon host: chạy sát dữ liệu, không đưa bí mật DB ra CI |
| Q2 | NocoEdu: nhận nuôi (V5.4) ngay sau V4, hay chờ nhập Lark xong? | Sau V4, trước nhập Lark thật, để import chạy qua kênh job |
| Q3 | Cho phép Studio giữ bản dump app NB3 trên VPS bao lâu trước khi đẩy ra ngoài? | 14 ngày, đẩy ra Drive hằng đêm |
| Q4 | Menu 8 mục theo đề xuất, hay giữ mục Agent/Runner ở cấp 1? | 8 mục |
| Q5 | Phát hành Studio qua Actions (V6.3): chấp nhận đưa khoá SSH/Dokploy vào secret của repo riêng tư? | Có, khoá riêng chỉ cho deploy, xoay 90 ngày |

## 5. Tiến độ
- [ ] V0 — Sửa nhanh
- [ ] V1 — Hôm nay và menu
- [ ] V2 — Trang việc
- [ ] V3 — Nhanh thật
- [ ] V4 — Kênh job và bí mật
- [ ] V5 — Dung lượng, sao lưu, đăng ký app
- [ ] V6 — Lark, tài liệu, phát hành
