# Kế hoạch: hoàn thiện Dương Sinh Studio theo tài liệu NocoBase Studio — 08/11/2026

> Trạng thái: **đã duyệt hướng đi (08/11/2026), Q1–Q4 và Q6 đã chốt, Q5 chờ chủ dự án sau khi đã đo M4.1**. Nguồn: 57 trang tài liệu chính thức NocoBase Studio (thư mục `C:\Users\duongsinh\Documents\nocobase studio`,
> lấy ngày 08/11/2026) đối chiếu với `main` = `b898aa8`. Ba báo cáo chi tiết (mỗi tính năng một dòng, có bằng chứng file:dòng) nằm cùng thư mục:
> `A-agents-runtimes-sessions.md`, `B-daily-work-inbox-admin.md`, `C-setup-ci-release-ops.md`.
> Tên bước dùng chữ **M** để không trùng U (06/11), K (07/11), L (08/11).

## 0. Kết luận

- Phần lõi đã đủ và cùng hướng tài liệu: đội agent (Lead Agent + skill `ds-*`), công việc, tiến độ (Hiện tại / Kế tiếp / Cần bạn), thẻ run lỗi,
  bàn giao, Hộp thư và badge, Dashboard, Usage, Tri thức, Ghi nhớ dự án, khoá tổ chức, ngân sách, tự lái, review chéo, CI cho repo mới và repo có sẵn.
- Lỗ hổng lớn nhất: **app NocoBase 3 chưa có đường preview → staging → production**. Preview hiện chỉ dành cho repo NocoBase 2
  (`server/previews/compose.ts`), driver phát hành là `external` không làm gì, `builds/deploy` luôn trả `APP_HOST_OFF`.
- Ba lỗi hoặc rủi ro đã kiểm chứng trong mã:
  1. `deploy/dokploy/config.yml` không đặt `auth.emailAndPassword.disableSignUp`, nên Better Auth mặc định **cho phép tự đăng ký**
     (`useSignUpAvailable` của plugin authentication: chỉ ẩn khi `disableSignUp === true`). Chưa kiểm trên production thật.
  2. `fallbackAfterSeconds = 120` của Lead Agent **không có tác dụng**: Studio không đăng ký `ModelSelectionPolicies`, plugin dùng 0
     (`app-plugin-agents/dist/server/core/runs/claim.js`: `policy?.fallbackAfterSeconds ?? 0`).
  3. Subject `issue` không khai `queuedExpiryMs` và `workspaces.settled`: run kẹt hàng đợi chờ mãi, thư mục làm việc của việc đã xong không tự dọn.

### 0.1 Kiểm lại ba phát hiện bằng mã hiện tại (08/11/2026, `main` = `b898aa8`)

Cả ba **đúng**; không phát hiện nào phải sửa. Bằng chứng:

1. **Tự đăng ký đang mở, đã xác nhận trên production.** `deploy/dokploy/config.yml` chỉ có `emailAndPassword.enabled` và `autoSignIn`; `server/config/auth.ts`
   cũng không đặt `disableSignUp`. Better Auth chỉ từ chối đăng ký khi `disableSignUp` là truthy (`better-auth` `sign-up/email`: `throw APIError.from("BAD_REQUEST"…)`),
   nên chặn ở **server**, không chỉ ẩn form. Một GET chỉ đọc vào `https://studio.dsc.edu.vn/main/register` cho cấu hình công khai
   `{"auth":{"emailAndPassword":{"enabled":true}}}` (không có `disableSignUp`) — tức Q1 = **có, đang mở**. Chưa có thao tác ghi nào lên production.
2. **`fallbackAfterSeconds = 120` không có tác dụng.** `grep ModelSelectionPolicies` trong `server/` và `client/` không ra gì; plugin dùng
   `policy?.fallbackAfterSeconds ?? 0` (`app-plugin-agents/dist/server/core/runs/claim.js:486`). Giá trị 120 chỉ nằm trong `server/agents/project-manager-settings.ts`.
3. **Subject `issue` thiếu `queuedExpiryMs` và `workspaces.settled`.** `server/providers/issue-subject.ts` (`SubjectBinding`, dòng ~353–420) không khai cả hai;
   plugin có cả hai (`sweeper.js:222` đọc `binding.queuedExpiryMs ?? 0`, nên không khai là không bao giờ hết hạn).

Ghi chú khi làm: lần `git pull` kéo theo commit L0 (bỏ symlink `node_modules` bị commit nhầm) nên phải `CI=true pnpm install --frozen-lockfile` lại.

## 1. Các bước

### M0 — Gấp: an toàn và điện thoại (~0,75 ngày)

1. **Tự đăng ký.** Chủ dự án mở `https://studio.dsc.edu.vn/main/register` trong cửa sổ ẩn danh; có form là đang mở. Sửa: `disableSignUp: true` trong
   `deploy/dokploy/config.yml` (dev giữ nguyên nếu test cần). Test: đăng ký bị từ chối, lời mời `/invite/:token` vẫn tạo được tài khoản. Nếu
   production đã có tài khoản lạ: liệt kê (chỉ đọc), báo chủ dự án, không tự xoá.
2. **Manifest PWA** để web push chạy trên iPhone: `pushManifest` của plugin web-push, `<link rel="manifest">`, icon 192/512, `apple-touch-icon`,
   `display: standalone`, tên "Dương Sinh Studio", màu navy. Viết hướng dẫn "Thêm vào màn hình chính → bật thông báo" cho iPhone và Android.
3. Sửa `docs/trien-khai-vps.md`: CLI đã đăng nhập được bằng trình duyệt (`/device`); bỏ câu "tạo khoá ở trang tài khoản" (trang chưa có, xem M2).

### M1 — Agent và runner chạy tin cậy (~2 ngày)

1. `workspaces.settled` cho subject `issue` (`done`/`cancelled` là xong; khoá trạng thái của plugin projects viết hai chữ `l`) để runner tự dọn thư mục và `nocobase-runner gc --ended` có tác dụng.
   Test ca `cancelled` còn nhánh chưa push.
2. `queuedExpiryMs` cho subject `issue`, lớn hơn backoff tối đa của tự lái (2 giờ); đề xuất 24 giờ. Run quá hạn đi vào thẻ "run lỗi" sẵn có và Hộp thư.
   ~~Sửa `stall.ts` để không coi run `queued` là đang chạy.~~ **Không làm (08/11/2026, kiểm lại khi hiện thực):** nếu bỏ `queued` khỏi nhóm "đang chạy", việc có run chờ hợp lệ (runner offline vài giờ) bị coi là đứng sau 30 phút, bị đánh thức thêm một run trùng rồi chuyển `blocked` với lý do sai ("không có lượt chạy"). Có `queuedExpiryMs` thì run chờ quá 24 giờ tự `failed` (`queuedExpired`), lúc đó `stall.ts` thấy việc không còn run đang mở và xử lý như mọi run lỗi.
3. Đưa độ ưu tiên của issue vào `runs.enqueue` (tham số của plugin tên là `priority`, nhỏ chạy trước; không có `priorityRank`): với 1 slot, việc khẩn chạy trước.
4. Nối `fallbackAfterSeconds` bằng `ModelSelectionPolicies.register('ds-project-manager', …)`; thêm **giao diện cài đặt Lead Agent** (model chính/dự phòng,
   thời gian chờ, nguyên tắc, giới hạn lượt chạy do comment, khôi phục mặc định) trên trang Agents hoặc Cài đặt, dùng `PATCH /projectManager` sẵn có.
   Ghi `docs/chenh-lech-upstream.md` mục 9.

### M2 — Sẵn sàng đón cộng tác viên (~2,5 ngày)

1. Giao diện mời thành viên bằng `InviteDialog`/`InvitationsSection` của plugin projects; có nút sao chép link (chưa có email).
2. Vai trò mặc định và owner đặt lại mật khẩu trên giao diện (`PUT /api/access/settings`, `POST /api/users/{id}/resetPassword`), hiện rõ ai nhận vai trò
   mặc định (luật "Visible and manageable role assignments").
3. Trang **Tài khoản của tôi**: hồ sơ, đổi mật khẩu, khoá API cá nhân (tạo, xoay, xoá, hiện bí mật một lần).
4. Trang chủ thành "việc của tôi" (tóm tắt Cần tôi quyết định / Đang làm, từ `taskGroups/summary` và `inbox/waiting`), bớt một lần chạm trên điện thoại.

### M3 — Giám sát run từ điện thoại (~2–4 ngày)

1. Tab Lượt chạy: Stop, xem prompt đầy đủ, thời lượng, Retry (hook có sẵn của plugin agents).
2. Biến chạy agent và skill theo dự án trên trang dự án (`ScopeVariables`, `ScopeSkills`), quyền chặt, có nhật ký khi xem bí mật.
3. (Tuỳ chọn, 2–3 ngày) Trạng thái việc báo ngược về hội thoại đã sinh ra việc (`conversations.links.registerKind('issue')`): chỉ gửi thông báo,
   không đánh thức agent để không tốn lượt.

### M4 — Giao hàng app NocoBase 3: preview → staging → production (~9–13 ngày, làm sau khi duyệt bước thử)

1. **Bước thử (1 ngày, chỉ đọc trên VPS):** đo RAM một app NocoBase 3 bản build (Studio đo được RSS 614 MB), RAM còn trống, quyết định DNS (wildcard
   `*.preview.dsc.edu.vn` hay một subdomain mỗi app). Báo cáo rồi **dừng chờ duyệt**.
2. **Driver Dokploy cho plugin `releases`** (thay `external`): mỗi App NocoBase 3 là một compose Dokploy (Node 24 + `dist` từ archive build;
   staging dùng Postgres, preview dùng SQLite). Dùng lại allowlist an toàn của `server/previews/dokploy.ts` (chỉ compose do Studio tạo trong project của
   Studio). Có ngay trang App/Environment, biến môi trường + chặn khi thiếu biến, lịch sử deploy, rollback, môi trường được bảo vệ có duyệt,
   `maxApps` 1–2, tự dừng khi rảnh. 5–8 ngày.
3. **PR preview cho app NocoBase 3**: trigger `pull_request` + nhãn `preview` (giữ opt-in), một chỗ mỗi lúc, lỗi dựng báo vào Hộp thư và push. 2–3 ngày.
4. **Phát hành**: gắn artifact với version (`versionArtifacts`); "Cách phát hành" trên điện thoại (chọn commit đang chạy ở staging → xem việc gồm/thiếu →
   tạo tag qua GitHub API, có xác nhận); hướng dẫn đưa production theo skill `nocobase-deployment`. **Không** để Studio tự chạm production NocoBase 2.
5. Giao diện nguồn check, check advisory, release line trong mục Mã nguồn của dự án (hiện chỉ API/CLI). Chặn mở việc khác khi "Khởi tạo dự án" chưa xong.

### M5 — Vận hành (phần lớn chờ chủ dự án)

| Việc                                                                                            | Ai                                               | Ghi chú                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| Sao lưu ra Google Drive (rclone, K0.3) + bản sao `SECRETS_KEYS` ngoài VPS                       | Chủ dự án cấp quyền, agent chạy thử và khôi phục | **Ưu tiên cao nhất ngoài mã**: một VPS đang giữ cả dữ liệu lẫn khoá |
| Nối token GitHub cá nhân (có Workflows) → L3.3: CI cho `nocofen`, PR thử, tự lái merge khi xanh | Chủ dự án nối token, agent làm                   |                                                                     |
| Gmail App Password → email lời mời, quên mật khẩu, cảnh báo                                     | Chủ dự án                                        | Sau M2 thì email mới có ích                                         |
| Xoá khoá Dokploy cũ `studio`                                                                    | Chủ dự án                                        |                                                                     |
| Nhắc khoá CI, khoá tổ chức, token sắp hết hạn vào Hộp thư                                       | Agent (0,5 ngày)                                 |                                                                     |
| Tự động build bản phát hành Studio bằng GitHub Actions                                          | Agent (1–2 ngày), tuỳ chọn                       | Cân nhắc kỹ vì phải đưa bí mật SSH/Dokploy vào CI                   |

## 2. Không làm (đã cân nhắc)

GitLab/Gitea/GitHub Enterprise; Jenkins; agent tự báo check làm nguồn chính (runner bị cấm chạy kiểm tra toàn repo); App Host in-process hoặc Docker
(RAM, và Docker socket tương đương quyền root trên VPS đang chạy production); Redis; S3; nhiều preview song song; preview mặc định cho mọi PR;
chi phí theo USD; OAuth Git cá nhân, ghi công commit; view Split/Table và phím tắt (dùng điện thoại); runtime cá nhân và luồng xác nhận;
thêm slot runner; hội thoại có checkout mã; My Agent/ACP; Switch runtime; skill theo repository; tìm kiếm ngữ nghĩa/OCR trong Tri thức;
quyền theo thư mục trong Tri thức (làm khi có tài liệu nhạy cảm và có cộng tác viên).

Cố ý khác tài liệu, giữ nguyên: tự lái tự merge; review chéo bằng Opus; preview theo nhãn `preview`; đánh thức do tự lái đảm nhận; một instance.

## 3. Thứ tự và công sức

M0 → M1 → M4.1 (dừng chờ duyệt) → M3; M2 sau M4 (Q3 = M4 trước). M5 làm song song khi chủ dự án sẵn sàng. Tổng khoảng 16–22 ngày làm của agent. Mỗi bước một nhánh,
một PR, CI xanh, cập nhật mục Tiến độ. Production chỉ cập nhật khi chủ dự án đồng ý, theo `docs/trien-khai-vps.md`.

## 4. Câu hỏi cần chủ dự án chốt

| #   | Câu hỏi                                                          | Khuyến nghị                                                                                                                                          |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `/main/register` trên production có form không?                  | **Đã trả lời (08/11/2026): có, đang mở.** Đo bằng GET chỉ đọc, xem mục 0.1. Làm M0.1 đầu tiên và đưa production khi chủ dự án đồng ý.                |
| Q2  | Điện thoại dùng iPhone hay Android?                              | **Android.** M0.2 làm manifest chuẩn Android (cài vào màn hình chính, web push); chỉ thêm `apple-touch-icon` vì rẻ, **không** viết hướng dẫn iPhone. |
| Q3  | Ưu tiên đón cộng tác viên (M2) hay giao hàng app NB3 (M4) trước? | **M4 trước.** Thứ tự: M0 → M1 → M4.1 (đo đạc, chỉ đọc) rồi **dừng chờ duyệt** → M3. M2 đẩy xuống sau M4.                                             |
| Q4  | Hạn chờ hàng đợi `queuedExpiryMs`                                | **24 giờ.**                                                                                                                                          |
| Q5  | DNS preview: wildcard hay từng subdomain?                        | Đã đo (M4.1): khuyến nghị đổi thành **tên cố định từng app**, không wildcard (lý do ở báo cáo M4.1 mục 3). Chờ chủ dự án chốt.                       |
| Q6  | Có tự động build bản phát hành Studio trên CI không?             | **Chưa**, làm sau M4.                                                                                                                                |

## 5. Tiến độ

(Ghi ngày, PR, kết quả kiểm, bản production, việc còn mở dưới từng dòng khi xong.)

- **Production (08/11/2026): `3a83493` đã lên** (M0.1, M0.2, M1, M3). Quy trình `docs/trien-khai-vps.md`: build trên máy dev, `dist check` đạt, tải lên `releases/3a83493`, chờ hết run, tạm dừng tự lái Dương Sinh App và Sandbox (`Cập nhật Studio (3a83493)`), dump `studio-before-3a83493-20261108-1600.dump` (934 mục), chép `config.yml` mới (`disableSignUp: true`), đổi `STUDIO_RELEASE` qua API Dokploy (chỉ dòng đó đổi, 13 biến khác nguyên), Deploy. Kiểm: container `healthy`, mount `3a83493`, `healthz` ok, 0 lỗi mức 50 trong log, cấu hình công khai có `disableSignUp: true`, runner `vps-studio-runner` online. **Chưa kiểm được:** từ chối đăng ký thật (không dùng email hợp lệ để khỏi tạo tài khoản; test tự động đã chứng minh), `gc --ended` trên runner, cài PWA trên điện thoại. **Sau deploy phát hiện hai việc:** (1) manifest PWA không được phục vụ, sửa ở `fix/m0-2-manifest-under-assets` (cần deploy lần hai); (2) sau `autopilot resume`, Dương Sinh App có `enabled = false` (trước đó `true`), chưa rõ do ai (mã `resume` chỉ xoá `pausedReason`, không có sự kiện nào ghi); chưa bật lại, chờ chủ dự án quyết. Runner có 26 thư mục làm việc, một cái chưa push thuộc DS-4 (đã `done`, PR #8 đã merged), nên việc dọn không làm mất công việc nào. **Liệt kê tài khoản trên production (08/11/2026, chỉ đọc, không xóa gì): không có tài khoản lạ.** Bảng `user` chỉ có 3 dòng: `admin` (owner, tạo lúc cài đầu 02/11/2026 16:41, có đăng nhập `credential`, vai trò `root` và `member`) và hai tài khoản dịch vụ do chính Studio tạo (`studio-autopilot` 04/11, `studio-organization-keys` 07/11, `kind = service`, địa chỉ `@system.internal`, không có phương thức đăng nhập). Không có dòng nào bị khóa hay xóa mềm; `user_invitations` và `verification` đều rỗng (không có lời mời hay dấu vết đăng ký); chỉ có một khóa API (CLI của owner trên máy dev, đang bật); phiên chỉ của `admin`. Giới hạn: DB không ghi lại tài khoản đã bị xóa cứng, và log container trước lần deploy 15:50 không còn, nên không loại trừ được một lần đăng ký rồi bị xóa; nhưng không có dấu vết nào cho thấy điều đó. Cửa đăng ký đã đóng từ `3a83493`. **Deploy lần hai (08/11/2026): `22706a8` lên production** để sửa manifest: dump `studio-before-22706a8-20261108-1650.dump` (934 mục), tạm dừng rồi bật lại tự lái Sandbox, `config.yml` không đổi. Kiểm: container `healthy`, mount `22706a8`, `healthz` ok, 0 lỗi mức 50, runner online, `/main/assets/manifest-v1.json` trả `200 application/json`, cả bốn biểu tượng `image/png`, đăng ký công khai vẫn đóng (`disableSignUp: true`). **Dương Sinh App tắt tự lái có chủ ý của chủ dự án** (dự án bị huỷ, thay bằng dự án mới): không phải lỗi của `resume`, giữ nguyên `enabled = false`. Bài học vận hành: (a) không ghép cả chuỗi lệnh khởi động build vào một `&` (log cũ làm monitor báo xong sớm); (b) kiểm bằng chính server, không chỉ bằng tệp. Chưa kiểm: cài PWA và gửi thông báo thử trên Android thật; từ chối đăng ký bằng yêu cầu thật; `gc --ended`. Đã dọn bản cũ theo `docs/trien-khai-vps.md` (08/11/2026): giữ `22706a8` (đang chạy), `3a83493`, `b898aa8` trong `releases/` để quay lui (1,1 GB); xóa `63f4bc5`, `933b73b`, `b8659d1`, `a542302` và 4 tarball `studio-*.tar.gz` đã giải nén trong `incoming/` (giữ `runners-dist.tgz`); bản đang mount được kiểm trước khi xóa, `healthz` và manifest vẫn 200 sau đó. Tarball còn bản trên máy dev ở `~/code/release`.
- BƯỚC 0 xong (08/11/2026): kế hoạch và 3 báo cáo đã chép vào repo (`docs/plans/research/2026-11-08/`, thêm vào `.prettierignore`); ba phát hiện mục 0 đã kiểm đúng
  (mục 0.1); Q1–Q4 và Q6 đã chốt. Việc còn mở: M0 trở đi. Stash `local-before-pull-2026-11-08` giữ thay đổi local cũ (đã nằm trên `main`, chỉ khác định dạng) — xoá được.

- [ ] M0 — An toàn và điện thoại
  - M0.1 xong trong mã (08/11/2026, **chưa lên production**): `disableSignUp: true` ở `deploy/dokploy/config.yml`; test `tests/server/sign-up-closed.test.ts` (2 test đạt: đăng ký bị từ chối 400, lời mời vẫn tạo tài khoản). Còn mở: đưa lên production khi chủ dự án đồng ý (sao lưu, tạm dừng tự lái, bật lại — `docs/trien-khai-vps.md`); liệt kê tài khoản không do owner tạo trên production (chỉ đọc) — cần chủ dự án cho cách truy cập DB.
  - M0.2 + M0.3 xong trong mã (08/11/2026, chưa lên production): `public/manifest.webmanifest` (URL tương đối để đúng với `/main`), 4 icon dựng từ `ds-mark.svg` (192, 512, maskable, apple-touch 180), `<link rel="manifest">` + `apple-touch-icon` trong `index.html`; hướng dẫn Android ở `docs/cai-tren-dien-thoai.md`; `docs/trien-khai-vps.md` đã sửa phần CLI (đăng nhập trình duyệt `/device`). Kiểm: `tests/project/pwa-manifest.test.ts` (3 test), Vite build thử trên trang nhỏ viết lại đúng `./manifest.webmanifest`. Khác kế hoạch: không dùng `pushManifest` (chỉ dựng JSON) mà dùng tệp tĩnh, không cần route server. Còn mở: cài thử trên Android thật sau khi lên production và gửi một thông báo thử. **Lỗi phát hiện khi lên production (08/11/2026):** manifest để ở gốc `public/` không bao giờ được server phục vụ (nhận `index.html`), đã chuyển sang `public/assets/manifest-v1.json` (xem `chenh-lech-upstream.md` mục 32).
- [x] M1 — Agent và runner tin cậy (xong trong mã 08/11/2026: PR #20, #21, #22, #23; chưa lên production)
  - M1.1 (08/11/2026): subject `issue` khai `workspaces.settled` (`settledIssues` trong `server/providers/issue-subject.ts`: `done` hoặc `cancelled`, id lạ bị bỏ qua). Test `tests/server/issue-subject-workspaces.test.ts`; typecheck `tsconfig.server.json` sạch. **Lưu ý:** plugin xoá thư mục "whatever those still hold", nên nhánh chưa push của việc đã huỷ sẽ mất cùng thư mục; `commits` đã deprecated, không còn cách giữ lại bằng chứng push. Việc còn mở: kiểm `nocobase-runner gc --ended` trên runner thật sau khi lên production.
  - M1.2 (08/11/2026): `queuedExpiryMs = 24 giờ` (`QUEUED_EXPIRY_MS` trong `server/providers/issue-subject.ts`), test khẳng định lớn hơn `MAX_QUOTA_BACKOFF_MS` (2 giờ, nay được export). Run quá hạn thành `failed`/`queuedExpired` (đã xác nhận ở `sweeper.js`), hiện trong thẻ run lỗi (mọi run `failed` đều vào đó) và nhãn tiếng Việt đã có. Không sửa `stall.ts` (lý do ở bước 2 trên). Chưa thử một run thật hết hạn trên production.
  - M1.3 (08/11/2026): `server/agents/run-priority.ts` (`runPriorityOf`: urgent 0, high 1, medium 2, low 3, none và không rõ 4) nối vào cả ba chỗ gọi `runs.enqueue` (`agent-executor.ts`, `issue-work.ts` nút bắt đầu, wrapper của tự lái dùng cho scheduler và stall). Test `tests/server/run-priority.test.ts` (ba issue low/none/urgent tạo theo thứ tự ngược, run xếp hàng mang 3/4/0) và 5 tệp test liên quan đạt. Việc gộp vào run đang chờ lấy mức khẩn hơn (theo plugin). Chưa đo thứ tự claim thật với 1 slot trên production.
  - M1.4 (08/11/2026): `server/providers/project-manager.ts` đăng ký `ModelSelectionPolicies` cho `ds-project-manager` (đọc `fallbackAfterSeconds` ở mỗi claim, nên `120` giờ mới có tác dụng); trang **Cài đặt → Trưởng nhóm agent** (`client/pages/settings/project-manager.tsx`, route `settingsProjectManager`, đọc cần `settings:agents.agents` read, sửa cần `manage`): model chính/dự phòng, thời gian chờ, tên, mô tả, giới hạn lượt chạy do comment, nguyên tắc (có sẵn hoặc tuỳ chỉnh), khôi phục mặc định (chỉ các con số và nguyên tắc, không đổi agent đã chọn); route mới `GET /api/projectManager/agentOptions` và trường `defaults` (ghi ở `chenh-lech-upstream.md` mục 9); 3 ngôn ngữ. Test: `tests/server/project-manager-selection.test.ts` (2), `tests/client/project-manager-page.test.tsx` (5), ba danh sách route/điều hướng cập nhật; `agent-gate` vẫn đạt; tsc client và server, eslint, locales check sạch. **Phát hiện thêm:** `delegationQueueTimeoutSeconds` vẫn chỉ được lưu, không ai đọc, nên giao diện không hiện nó (cùng kiểu lỗi với `fallbackAfterSeconds`); dùng nó cần việc riêng. Chưa thử trên production.
- [x] M2 — Đón cộng tác viên (xong trong mã 08/11/2026: PR #35, #36, #37 và M2.4; chưa lên production)
  - M2.1 (08/11/2026): nút **Mời thành viên** (`client/components/invite-members.tsx`, bọc `InviteDialog` của plugin projects: nhiều email, chọn dự án, hiện liên kết đăng ký **một lần** kèm nút sao chép) ở trang Người dùng (người có `invite` trên `pm.members`, chọn trong mọi dự án) và ở đầu trang dự án (trưởng dự án hoặc người có `invite`, chỉ dự án đó và bắt buộc chọn); mục **lời mời chưa nhận** (`InvitationsSection`: gửi lại, thu hồi) dưới bảng Người dùng. Không có route mới: server do plugin kiểm. Trang nhận lời mời `/invite/:token` đã có sẵn từ plugin users. Hướng dẫn cho chủ dự án: `docs/moi-thanh-vien.md`. Test: `tests/client/invite-members.test.tsx` (5), cùng 6 tệp test cũ của trang Users vẫn đạt (63 test); tsc, eslint, locales check sạch. **Lỗi bắt được khi làm:** `canUseSetting` của plugin sập nếu `viewer` có mặt nhưng thiếu `permissions` (lúc `GET /projects/me` đang tải hoặc dữ liệu lạ): đã bảo vệ ở `useMayInvite`. Việc còn mở: chưa thử mời thật trên production (cần deploy); email mời chưa gửi được (M5); người mới chưa có vai trò cho đến khi làm M2.2.
  - M2.2 (08/11/2026): (a) trang **Cài đặt → Tài khoản và phân quyền → Thành viên mới** (`client/pages/settings/new-member-role.tsx`, route `settingsNewMemberRole`, quyền `pm.members` đọc, đổi cần `define-roles`): chọn vai trò mặc định (không có _owner_) hoặc không có, cảnh báo khi không có vai trò, và **liệt kê ai đang giữ vai trò đó** (đúng luật \"Visible and manageable role assignments\": vai trò được gán một lần lúc nhận lời mời, không cấp cho mọi người đăng nhập); dùng `GET/PUT /api/access/settings`, `/roles`, `/members` sẵn có, không route mới. (b) nút **Đặt lại mật khẩu** ở mỗi dòng Người dùng (`client/pages/settings/reset-password.tsx`): mật khẩu tự nhập hoặc tạo ngẫu nhiên (16 ký tự, bỏ ký tự dễ nhầm), hiện lại để sao chép, tùy chọn đăng xuất mọi phiên (bật sẵn), chỉ đăng xuất sau khi đặt thành công. Test: `new-member-role` (5), `reset-password` (5), `tests/server/reset-password.test.ts` (đặt lại thật, người thường bị từ chối, mật khẩu ngắn bị từ chối, `revokeSessions`), các test route/điều hướng và 5 tệp test cũ của trang Users vẫn đạt (67 test client); tsc, eslint, locales check sạch. Hướng dẫn: `docs/moi-thanh-vien.md`. Việc còn mở: chưa thử trên production (cần deploy); chưa có trang tự đổi mật khẩu (M2.3).
  - M2.3 (08/11/2026): trang **Cài đặt → Tài khoản và phân quyền → Tài khoản của tôi** (`client/pages/settings/my-account/`, route `settingsMyAccount`, `authz: 'skip'` nên không route nào từ chối ai, cùng cơ chế với \"Thông báo của tôi\"; **chưa kiểm bằng một tài khoản thường trên production** xem mục Cài đặt có hiện ra không): **hồ sơ** (sửa tên; email và tên đăng nhập chỉ xem), **đổi mật khẩu** (mật khẩu hiện tại, mới hai lần, tuỳ chọn đăng xuất phiên khác), **khoá API cá nhân** (tạo với hạn 7/30/90/365 ngày hoặc không hết hạn, bí mật hiện **một lần** kèm nút sao chép, xoay = tạo thay thế trước rồi mới xoá khoá cũ, xoá có xác nhận). Dùng client Better Auth sẵn có, không route server mới. Test: `tests/client/my-account.test.tsx` (10, gồm thứ tự xoay khoá và \"tạo lỗi thì giữ khoá cũ\"), `tests/server/my-account.test.ts` (luồng thật: đổi tên, mật khẩu sai/đúng, mật khẩu cũ hết hiệu lực, khoá tạo/liệt kê không lộ bí mật/dùng được qua `x-api-key`/người khác không xoá được/xoá xong bị từ chối 401), route và điều hướng cập nhật; tsc, eslint, locales check sạch. Việc còn mở: chưa thử trên production; chưa có liên kết trong menu tài khoản của shell (người dùng vào qua Cài đặt).
  - M2.4 (08/11/2026): trang chủ `client/pages/home/index.tsx` thành **\"việc của tôi\"**: lời chào, ba lối tắt (Công việc của tôi, Hộp thư, Dự án) và hai thẻ: **Cần tôi quyết định** (con số từ `taskGroups/summary`, tối đa 5 việc từ `inbox/waiting`, mỗi việc bấm là tới thẳng trang việc; còn nhiều hơn thì \"Xem cả N việc trong Hộp thư\") và **Đang làm** (việc mở của tôi trừ việc chờ tôi, kèm nút mở Công việc của tôi). Tự làm mới 30 giây, lỗi tải hiện ngay kèm nút Thử lại (không thử lại ngầm). Bớt một lần chạm trên điện thoại: quyết định hiện ngay trang chủ thay vì phải vào Hộp thư. Thay trang giới thiệu của template (xoá `capabilities.ts`, `prompt-dialog.tsx`, `use-copy.ts` và test cũ); ghi chú ở `.agents/rules/duongsinh-studio.md`. Test: `tests/client/home.test.tsx` (6); route và shell vẫn đạt; tsc, eslint, locales check sạch. Việc còn mở: chưa xem trên điện thoại thật; \"Đang làm\" chỉ là con số và liên kết, chưa liệt kê từng việc.
- [x] M3 — Giám sát run từ điện thoại (xong trong mã 08/11/2026: PR #26, #27 và M3.3 nửa A; chưa lên production)
  - M3.1 (08/11/2026): `client/pages/issues/detail/issue-runs.tsx` nay có thời lượng (run đang chạy tính đến giờ, run chờ hiện "chờ …"), **Dừng** (hộp xác nhận, cho run `queued/dispatched/running`), **Chạy lại** (run `failed/cancelled`) và **Xem prompt đầy đủ** (chỉ tải khi mở), dùng `useStopRun`, `useRetryRun`, `useRunBrief` của plugin agents. Quyền do plugin kiểm ở server (người bắt đầu hoặc sở hữu run, hoặc quản lý agents); người không đủ quyền thấy nút nhưng nhận lỗi gốc của plugin, chưa ẩn nút trước. Hook của plugin dùng query client riêng nên trang tự làm mới cache `issues/:id/runs` (`useRefreshIssueRuns`). Test: 4 test mới trong `tests/client/issue-work.test.tsx` (11 đạt); tsc, eslint, locales check sạch. Chưa thử trên điện thoại thật.
  - M3.2 (08/11/2026): mục **Agent làm việc trong dự án** trên trang dự án (`client/pages/projects/project-agent-settings.tsx`, gắn vào `detail.tsx`) dùng `VariablesSection` và `DefaultSkillsSection` của plugin trên scope `project` mà Studio đã đăng ký (`server/providers/project-defaults.ts`; subject `issue` đã khai scope này cho mọi run). **Chỉ người quản lý dự án thấy mục**, kể cả tên biến. Server (plugin) vẫn kiểm lại: giá trị chỉ ghi, lộ giá trị và xem nhật ký cần quyền sửa scope, mỗi lần lộ ghi vào nhật ký truy cập. Test: `tests/client/project-agent-settings.test.tsx` (2) và `tests/server/project-variables-access.test.ts` (chưa đăng nhập 401; người ngoài dự án members-only nhận 403/404 khi liệt kê, xem nhật ký, lộ và ghi; giá trị không bao giờ nằm trong danh sách; quản lý lộ được giá trị và để lại bản ghi `reveal`); tsc, eslint, locales check sạch. Việc còn mở: chưa thử với run thật nhận biến (cần runner có tính năng `secrets`); `detail.tsx` chưa có test nên việc gắn mục vào trang chỉ được kiểm bằng tsc.
  - M3.3 (08/11/2026), **chỉ nửa A theo quyết định của chủ dự án** (nửa B, báo ngược chủ động, hoãn): hội thoại nay được gắn với các việc nó sinh ra. `server/conversations/studio-conversations.ts` thêm `createConversationIssueLinkKind` (đăng ký bằng `conversations.links.registerKind('issue')` ở `server/providers/conversations.ts`; `resolve` chỉ trả việc chủ hội thoại được phép thấy, trạng thái bằng lời, thêm "Chờ bạn nghiệm thu" nếu việc đang chờ chính họ) và `issuesCreatedByPlan` (việc do plan tạo, mỗi việc một lần; plan `executed` hoặc `failed` giữa chừng thì tính, `voided`/`stale`/`undone` thì không). Khi plan được quyết, `planDecided` gắn các việc đó bằng `links.attach` (origin `application`, trong cùng transaction với tin `ds.plan.decided`). Mỗi lượt của hội thoại sẽ liệt kê "Linked work" kèm trạng thái hiện tại nên agent đọc được tiến độ mà không bị đánh thức. Test: 2 test mới trong `tests/server/studio-conversations.test.ts` (8 đạt) và mở rộng `tests/server/conversations-routes.test.ts` (thực hiện plan thật rồi kiểm hội thoại có đúng một liên kết `issue`, origin `application`, kèm tiêu đề và trạng thái); tsc client và server, eslint, locales check sạch. Việc còn mở: chưa xem phần "Linked work" hiện trong khung chat thật; chưa test việc người dùng tự gắn việc qua API (do plugin kiểm bằng chính `resolve` này).
- [ ] M4 — Giao hàng app NocoBase 3
  - M4.1 xong (08/11/2026): đo chỉ đọc trên VPS, báo cáo ở `2026-11-08-m4-1-do-dac-vps.md`. RAM khả dụng ≈ 3,0 GiB (VPS nay 6 nhân, 11,96 GiB), swap 8,6 GiB, Traefik chỉ có `httpChallenge` (không wildcard cert), DNS do Mắt Bão quản lý và chưa có wildcard. Kết luận: đủ cho 1–2 app NB3, không đủ chạy runner nặng cùng nhiều preview. **Dừng chờ duyệt** (4 câu ở mục 5 của báo cáo) trước khi viết driver Dokploy (M4.2).
- [ ] M5 — Vận hành
