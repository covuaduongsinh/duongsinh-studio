# Prompt triển khai "Cập nhật Dương Sinh Studio theo NocoBase 3 mới" (dán nguyên phần dưới vào một phiên Claude Code mới)

> Mở phiên **trong WSL** (`cd ~/code/duongsinh-studio && claude`), không điều khiển WSL qua `wsl.exe` từ Windows (tiến trình
> nền hay bị tắt giữa chừng). Trước đó, trên Windows: `git -C D:\code\duongsinh-studio pull` để mirror có `docs/plans/`.
> Không chứa mật khẩu / khoá API.

---

Bạn là kỹ sư triển khai cho Dương Sinh Studio (ứng dụng NocoBase 3 của Công ty CP Cờ vua Dương Sinh). Trả lời và báo cáo
bằng **tiếng Việt** (code, lệnh, định danh, commit message giữ tiếng Anh theo Conventional Commits, **không** thêm dòng
Co-Authored-By hay ghi công nào vào commit/PR).

## Nhiệm vụ

Thực hiện kế hoạch đã duyệt `docs/plans/2026-11-06-nocobase-studio-ra-soat-cap-nhat.md` — đọc **toàn bộ**, làm đúng mục 3
theo thứ tự **U1 → U8** (nâng template/gói lên bản beta 06/11 trước, rồi áp cơ chế mới của plugin, rồi lấp các route/trang
còn thiếu so với demo NocoBase Studio: tiến độ công việc + hàng đợi agent, inbox hợp nhất + follow-ups, dashboard, thiết
lập dự án + khoá tổ chức + git + tri thức, thông báo ra ngoài + ngân sách, vận hành). Các quyết định ở mục 6 (Q1–Q5) hỏi
chủ dự án **ngay đầu phiên** bằng câu hỏi có lựa chọn, nêu khuyến nghị; Q4 hỏi lại trước U7/U8.

## Bối cảnh cần đọc trước

- Repo Studio: WSL `~/code/duongsinh-studio` (remote `covuaduongsinh/duongsinh-studio`, nhánh `main`, hiện `729a59a`). Đọc
  `AGENTS.md`, `.agents/rules/duongsinh-studio.md`, `docs/chenh-lech-upstream.md` (đủ 22 mục), `docs/trien-khai-vps.md`,
  `docs/thuat-ngu.md`, `docs/moi-truong-dev.md`, và các file mã nêu trong từng bước của kế hoạch (`server/providers/agent-actions.ts`,
  `server/autopilot/*.ts`, `server/config/{mail,notification}.ts`, `server/routes/*.ts`, `client/routes.ts`).
- Hợp đồng đối chiếu (chép nguyên văn vào `docs/plans/archive/`): `docs/plans/archive/2026-11-01-nocobase-studio-dac-ta-demo-api.md`,
  `docs/plans/archive/2026-11-01-nocobase-studio-phu-luc-api-cli.md` (186 route Studio + 389 lệnh + schema), kế hoạch tổng
  `docs/plans/archive/2026-11-01-nocobase-studio-ke-hoach-phat-trien.md` (mục 10 Tiến độ), S6 `2026-11-03-nocobase-studio-s6-hoan-thien.md`
  (chỉ tham chiếu; U4–U8 đã gộp), autopilot `2026-11-04-studio-autopilot.md`.
- Mã upstream NocoBase 3: `D:\code\nocobase`, ref `upstream/v3-develop` = `7c25f885` (06/11/2026), **chỉ đọc** bằng
  `git show upstream/v3-develop:<path>`; CHANGELOG của gói đã cài đọc trong `node_modules/@nocobase/*/CHANGELOG.md`.
- Demo quốc tế https://studio.demo.nocobase.com/main/ (tự đăng nhập; `GET /main/api/swagger`, `/main/api/cli/manifest`) khi
  cần soi hình dữ liệu thật. Chỉ đọc, không tạo dữ liệu trên demo. Bản demo vẫn là 1.0.0-beta.71 (đã kiểm 06/11).
- Production Studio: `https://studio.dsc.edu.vn` (Dokploy project `duongsinh-studio`, compose `studio`, bản `cd6421a`);
  runner dùng chung `vps-studio-runner` (user `studio-runner`), runner máy dev đang dừng; CLI `ds-studio` trong WSL đã đăng
  nhập production bằng API key của owner. Autopilot đang **bật** cho project Dương Sinh App — trước khi nâng production
  (cuối U1) hãy tạm dừng tự lái (`POST /api/projects/{id}/autopilot/pause`) rồi bật lại sau khi kiểm xong.

## Luật làm việc (bắt buộc)

1. **Không** đụng production NocoBase `nocobase.dsc.edu.vn` (container `nocobase-dsc-*`, `/srv/nocobase-dsc`), không đụng
   stack nào khác trên VPS 217.15.160.118 ngoài compose `studio` của project `duongsinh-studio` và user `studio-runner`.
   Không sửa `D:\code\nocobase` và `D:\code\duongsinh-nocobase`.
2. Bí mật (`~/code/secrets/*.secret`, khoá Dokploy, PAT, khoá GitHub App, mật khẩu, VAPID, SMTP) **không** in ra, không
   commit; chỉ đọc từ file/biến môi trường và gửi qua header.
3. Máy dev 12 GB RAM: không chạy test server khi dev server đang chạy; **mỗi lệnh nặng (lint, typecheck, test, build) chạy
   foreground với timeout tường minh**, test chia 3 nhóm (server+database, client a–k, client l–z + project); dùng exit code
   thật, không giấu lỗi bằng `| tail`.
4. U1 làm trên nhánh `template-upgrade-1.0.0-beta.88` theo đúng skill `.agents/skills/nocobase-app-upgrade/SKILL.md` (đọc
   trước khi gõ lệnh nào): không chép đè template, không `git checkout --`/`restore`/`reset --hard`/`stash`/`clean`; mọi
   file quyết định bằng tay; `defaultTemplateVersion` chỉ đổi sau khi merge nguồn thật. Sau `pnpm install` luôn
   `git diff package.json` và khôi phục dải phiên bản lõi nếu bị hạ cấp.
5. Commit nhỏ theo từng bước U (U1 có thể nhiều commit), push lên `origin/main` sau khi cổng kiểm tra xanh. Commit bằng
   `git commit -F <file>`.
6. Migration tự chứa, có `down`, test up/down/up. Mọi route có `describeRoute` (để lên manifest CLI `ds-studio`), kiểm
   quyền theo permission set; route chỉ-người từ chối run token và API key có phạm vi; route cho run opt-in
   `auth.required({ scopedKeys: true })` + `security: runToken` + action gate. Theo hợp đồng demo (tên resource, hình dữ
   liệu, enum) — lệch có chủ ý thì ghi lại.
7. Chuỗi hiển thị qua i18n `vi-VN`/`en-US`/`zh-CN` theo `docs/thuat-ngu.md` (issue = "Công việc", tri thức, agent, PR,
   merge…); override bản dịch máy của plugin ở `client/locales/overrides/vi-VN.ts`, `server/locales/overrides/vi-VN.ts`;
   `tests/client/locale-parity.test.ts` và `pnpm nocobase locales check` phải xanh.
8. Lệch so với README/CHANGELOG upstream: ghi mục mới vào `docs/chenh-lech-upstream.md`. Nhận diện Dương Sinh (logo, màu
   `#2B3990`, Roboto, trang đăng nhập navy, `StudioChatProvider`) phải giữ qua nâng cấp.
9. Triển khai production theo `docs/trien-khai-vps.md`: **sao lưu DB trước**, build bản phát hành trên máy dev
   (`pnpm build --target linux-x64 --node-version 24`), tải lên, đổi `STUDIO_RELEASE` qua Dokploy API, chỉ redeploy compose
   `studio`; kiểm `healthz`, đăng nhập, WebSocket 101, manifest CLI, `nocobase.dsc.edu.vn/main/api/healthz` vẫn 200; nâng
   runner VPS (`npm -g` dưới user `studio-runner`, `systemctl --user restart nocobase-runner`) **sau** server; giữ bản cũ
   để quay lui.
10. Dùng skill `superpowers:verification-before-completion` trước khi báo "xong" bất kỳ bước nào; không báo xong khi còn
    TODO, test bị skip, chưa build, hay chưa thử sống trên dev.
11. Hỏi chủ dự án (câu hỏi có lựa chọn, nêu khuyến nghị) trước: mọi lần cập nhật production; cấp thêm quyền GitHub App; đổi
    cấu hình VPS ngoài compose `studio`; lần gửi email/web push thật đầu tiên; bật DeepSeek hay agent mới; tạo khoá/tài
    khoản ở dịch vụ ngoài (rclone, UptimeRobot).

## Cách làm từng bước

- **U1**: đọc skill upgrade → nhánh → `npm pack` BASE `1.0.0-beta.86` và TARGET `1.0.0-beta.88` + `app-skills@0.1.0-beta.59`
  → đọc `AGENTS.md`/`README.MD` TARGET và CHANGELOG các gói (`app-server` 5, agents beta.2–5, projects beta.24–25, releases,
  agent-sessions, knowledge, users) → bảng file modified/untouched/gone → hợp nhất bằng tay (mailer, layout, overrides) →
  `pnpm install` + kiểm `package.json` → migrate thử DB dev mới và bản sao DB production → cổng kiểm tra (lint, typecheck,
  test 3 nhóm, build, locales check, e2e) → thử sống trên dev (6 trang nêu trong kế hoạch) → cập nhật docs
  (`chenh-lech-upstream.md`, `nang-cap.md`, `.agents/rules/duongsinh-studio.md` thêm `docs/plans/`) → merge vào `main`, push
  → (Q1) sao lưu + lên production + nâng runner → ca thật Sandbox (issue → PR → review → merge; autopilot 1 PR).
- **U2 → U8**: với mỗi bước: đọc mã liên quan và schema demo trong phụ lục → viết test trước (TDD; route: ẩn danh 401,
  contributor, run token, API key scope) → hiện thực (server → CLI tự sinh → client) → `pnpm lint && pnpm typecheck &&
pnpm test (3 nhóm) && pnpm build` xanh → thử sống trên dev (và `scripts/compare-studio-api.mjs` để đếm route Studio còn
  thiếu) → commit + push → cập nhật mục 7 "Tiến độ" của `docs/plans/2026-11-06-nocobase-studio-ra-soat-cap-nhat.md`
  (ngày, commit, số test, bản production, việc còn mở) và một dòng ở mục 10 kế hoạch tổng trong `D:\code\nocobase` (không
  commit repo đó) → báo cáo ngắn bằng tiếng Việt → hỏi chủ dự án trước khi đưa bước đó lên production.
- Dừng và hỏi nếu: gói mới lệch README đến mức phải đổi kiến trúc (ví dụ admission không phủ gate), migration plugin không
  có `down` trên Postgres, hay runner không claim được sau nâng cấp.

## Báo cáo cuối

Bằng tiếng Việt: commit theo từng U, số liệu cổng kiểm tra, phiên bản gói sau nâng cấp (bảng cũ → mới), bản phát hành
production + runner, kết quả ca thật trên Sandbox và Dương Sinh App, số route Studio của demo đã có / còn thiếu (từ
`compare-studio-api.mjs`), các mục mới trong `docs/chenh-lech-upstream.md`, việc còn mở; cuối cùng nhắc
`git -C D:\code\duongsinh-studio pull`.
