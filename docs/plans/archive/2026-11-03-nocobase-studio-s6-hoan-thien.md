# Kế hoạch S6 — Hoàn thiện (Dương Sinh Studio) — 03/11/2026

> Trạng thái: **bản nháp chờ chủ dự án duyệt.** Chưa làm gì của S6.
> Kế hoạch tổng: `2026-11-01-nocobase-studio-ke-hoach-phat-trien.md` (mục 5 "S6 — Hoàn thiện", mục 10 tiến độ).
> Hợp đồng tham chiếu: `2026-11-01-nocobase-studio-dac-ta-demo-api.md` mục 2 (Dashboard, Inbox), mục 7 (inbox, follow-ups,
> attention, dashboard), phụ lục `…-phu-luc-api-cli.md` (route `reports/*`, `inbox/*`, `followUps/*`, `attention`,
> `failedRuns/*`, `issueCommentRuns/*`). S5.7 (preview cho chính repo Studio) **bỏ qua** theo quyết định 03/11/2026.

## 1. Vị trí hiện tại (sau S5)

| Đã có                                                                                                                                                 | Còn thiếu cho S6                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Studio chạy thật ở `https://studio.dsc.edu.vn` (Dokploy, Postgres riêng); GitHub App + webhook; runner VPS dùng chung + 3 agent (Opus, Sonnet, Codex) | Giao diện vẫn tiếng Anh (chỉ en-US, zh-CN); logo/nhận diện của NocoBase                                 |
| Issue → PR → CI → review chéo → merge → done; KB, project memory, chat "Ask agent"                                                                    | **Dashboard** (`reports/*`) trống; chưa có số liệu giao hàng/agent/chi phí                              |
| Releases: môi trường, phiên bản theo tag, production mark, Inbox "Cần tôi quyết định" (feed)                                                          | Inbox chưa hợp nhất, chưa có badge `attention`, chưa có **Follow-ups**                                  |
| Preview NocoBase 2 thật (1 slot), staging chờ push `main`                                                                                             | Thông báo chỉ trong app; chưa email, chưa web push, chưa báo cáo tuần                                   |
| Sao lưu DB thủ công + script `backup.sh`                                                                                                              | Lịch sao lưu chưa cài; bản sao lưu nằm cùng máy; chưa có cảnh báo khi Studio/runner chết                |
| Usage của run được ghi (tokens)                                                                                                                       | **Giới hạn chi phí** (ngân sách) chưa có; gói thuê bao không tính tiền nên cần giới hạn theo lượt/token |

## 2. Nguyên tắc của S6

1. **Không đụng production NocoBase 2 và dữ liệu thật** (như S5). Studio chỉ ghi nhận.
2. **Ưu tiên thứ chủ dự án thấy mỗi ngày:** tiếng Việt, inbox, dashboard trước; nợ kỹ thuật sau.
3. **Mọi việc gửi ra ngoài** (email thật, web push, Zalo) và mọi thay đổi lâu dài trên VPS (cron, dịch vụ giám sát, đích sao
   lưu ngoài) **hỏi trước**, làm từng bước có đường lui.
4. Mỗi bước: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` xanh (chạy test chia 3 phần, từng bước ở foreground),
   sao lưu DB trước khi cập nhật production, kiểm production NocoBase 2 trước/sau.
5. Lớp Studio dùng lại plugin/UI Library sẵn có (notification, web-push, i18n, UI Library `dashboard`/`inbox` nếu có);
   lệch README ghi vào `docs/chenh-lech-upstream.md`.
6. Bí mật (SMTP, khoá VAPID) chỉ ở biến môi trường Dokploy / `*.secret`; không in, không commit.

## 3. Quyết định cần chủ dự án chốt (hỏi ở đầu phiên triển khai S6)

| #   | Câu hỏi                              | Khuyến nghị                                                                                                                                                                        | Phương án khác                                                          |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Q1  | Ngôn ngữ mặc định                    | **vi-VN mặc định cho mọi người**, giữ en-US để chuyển; dịch cả phần lớp Studio lẫn các plugin còn thiếu                                                                            | Chỉ dịch lớp Studio; giữ en-US mặc định                                 |
| Q2  | Email gửi thông báo (SMTP)           | Một hộp thư gửi riêng của công ty (vd `studio@dsc.edu.vn` qua Google Workspace/Mắt Bão), chỉ gửi cho thành viên Studio; mặc định chỉ email cho "Cần tôi quyết định" + báo cáo tuần | Gmail cá nhân với App Password (tạm); không email, chỉ inbox + web push |
| Q3  | Web push trên trình duyệt/điện thoại | **Có** (plugin `notification-web-push`, khoá VAPID sinh mới) cho việc cần quyết định                                                                                               | Không                                                                   |
| Q4  | Ngân sách                            | Theo **số lượt chạy và token** mỗi ngày/tháng cho từng project và agent (gói thuê bao không tính tiền); vượt 80 % thì cảnh báo, 100 % thì chặn xếp hàng (chủ dự án mở chặn được)   | Theo USD ước tính theo bảng giá model; không giới hạn                   |
| Q5  | Đích sao lưu ngoài VPS               | **Google Drive** của công ty qua `rclone` (đã có `rclone` chạy trên VPS) cho DB + `storage/` của Studio, giữ 30 ngày                                                               | S3 (Contabo/Cloudflare R2, tốn phí nhỏ); chỉ giữ trên VPS               |
| Q6  | Giám sát                             | Kiểm healthz Studio + runner online mỗi 5 phút từ chính Studio (job nội bộ) + một kiểm tra ngoài miễn phí (UptimeRobot) gửi email khi chết                                         | Không giám sát                                                          |
| Q7  | Menu Testing (quality)               | **Hoãn** (như demo, đang tắt)                                                                                                                                                      | Dựng khung                                                              |
| Q8  | Thông báo Zalo OA                    | **Hoãn** (cần OA + phí ZNS)                                                                                                                                                        | Làm plugin provider                                                     |

## 4. Các bước triển khai

### S6.1 — Tiếng Việt + nhận diện Dương Sinh (~2 ngày)

- Locale `vi-VN` cho lớp Studio (mọi key trong `client/locales`, `server/locales`), bật `i18n.defaultLocale: vi-VN`,
  bộ chuyển ngôn ngữ giữ en-US. Dùng bản vi-VN sẵn có của các plugin (projects đã có); plugin nào thiếu thì bổ sung bản
  dịch ở lớp app (không sửa `node_modules`), ghi danh sách vào `docs/chenh-lech-upstream.md`.
- Thuật ngữ thống nhất (bảng thuật ngữ trong `docs/thuat-ngu.md`): issue → "việc", pull request giữ nguyên "PR",
  merge → "gộp (merge)", runner → "máy chạy (runner)", agent giữ "agent"… (chủ dự án duyệt bảng trước khi dịch hàng loạt).
- Nhận diện: tiêu đề, logo, favicon theo skill `duong-sinh-design-guide` (màu `#2B3990`, font Roboto); trang đăng nhập.
- Kiểm chứng: test client snapshot các trang chính ở vi-VN; quét key thiếu (script so sánh en-US/vi-VN = 0 key thiếu);
  trình duyệt: My issues, Issue, Releases, Knowledge hiển thị tiếng Việt, không lỗi console.

### S6.2 — Inbox hợp nhất, badge, Follow-ups, quyết định khi run lỗi (~2,5 ngày)

- `inbox/items|pending|waiting|reconcile` hợp nhất mọi nguồn: nghiệm thu (`accept`), yêu cầu deploy/production mark,
  plan chờ duyệt, run lỗi cần quyết định, mention, PR merged/closed. Hai nhóm **Cần tôi quyết định** / **Thông báo**.
- `attention` + badge trên menu (My issues, Inbox, Releases), đánh dấu đã xem đồng bộ.
- **Follow-ups**: `followUps/following|issues|follow|unfollow|markSeen`, trang `/follow-ups` (issue tôi sở hữu/theo dõi,
  tiến độ Now/Next/Needs you, chưa đọc).
- `failedRuns/{runId}/decide|dispatch` (giao lại cho agent khác / thử lại / dừng), `issueCommentRuns/{issueId}/continue`
  (vượt giới hạn 20 run/24 h), `issues/{id}/sendBack` nếu chưa có.
- Kiểm chứng: test quyền (chỉ người liên quan thấy), e2e: run lỗi giả lập → thẻ quyết định → giao lại → chạy tiếp.

### S6.3 — Dashboard (~2,5 ngày)

- 6 route theo hợp đồng demo: `reports/delivery`, `reports/agents`, `reports/metrics`, `reports/attention`,
  `reports/projects`, `reports/usage` (groupBy agent/trigger/subject/model/tool/day), bộ chọn 7/30/90 ngày, so kỳ trước.
- Trang `/dashboard`: 4 thẻ KPI có sparkline (việc hoàn thành, thời gian chu kỳ trung vị, tỷ lệ do agent làm, chi phí/việc
  — với gói thuê bao hiển thị **token/việc** thay USD), khối hiệu quả agent, biểu đồ run theo kết quả, mục Cần chú ý.
  Biểu đồ theo skill `dataviz`.
- Quyền: `studio.reports/read` (admin, owner; contributor chỉ project mình).
- Kiểm chứng: test số liệu trên dữ liệu mẫu cố định (fixture) cho từng route; so tay với DS-1/DS-2.

### S6.4 — Thông báo ra ngoài + báo cáo tuần (~1,5 ngày, cần Q2/Q3)

- Email qua plugin `notification` + kênh mail (SMTP từ biến môi trường); mẫu email tiếng Việt; người dùng tự chọn loại
  thông báo nhận qua email.
- Web push (`notification-web-push`, khoá VAPID), đăng ký trên trình duyệt/điện thoại.
- Báo cáo tuần sáng thứ Hai: tóm tắt delivery/agents/attention gửi inbox + email chủ dự án.
- Kiểm chứng: gửi thử đến **địa chỉ của chủ dự án** (hỏi trước lần gửi thật đầu tiên); không gửi cho người khác khi thử.

### S6.5 — Giới hạn chi phí (~1,5 ngày, cần Q4)

- Bảng `dsBudgets` (scope project/agent/global, kỳ ngày/tháng, giới hạn run và token), `dsBudgetEvents`.
- Kiểm tra khi xếp hàng run (`runs.enqueue` qua hook của lớp Studio): ≥ 80 % → thông báo; ≥ 100 % → không xếp hàng, issue
  nhận comment giải thích + thẻ quyết định "Mở chặn" cho chủ dự án.
- Trang Settings → Ngân sách; hiển thị mức dùng trên Dashboard.
- Kiểm chứng: test đặt hạn thấp → run thứ N bị chặn, mở chặn → chạy; không ảnh hưởng run đang chạy.

### S6.6 — Vận hành: sao lưu ngoài, giám sát, dọn dẹp, nâng cấp (~1,5 ngày, cần Q5/Q6)

- Cài lịch sao lưu (cron hằng ngày, đã viết `backup.sh`) + đẩy ra **Google Drive** bằng `rclone` (remote riêng, chủ dự án
  tự uỷ quyền rclone), giữ 30 ngày; thử khôi phục vào DB tạm mỗi tháng (script kiểm).
- Giám sát: job nội bộ kiểm runner online/healthz, cảnh báo vào inbox + email; UptimeRobot (chủ dự án tạo tài khoản) cho
  `studio.dsc.edu.vn`.
- Dọn: `incoming/*.tar.gz`, bản phát hành cũ (giữ 3), log; `agents.runs.retentionDays` (đề xuất 90).
- Quy trình nâng cấp NocoBase 3 beta theo skill `nocobase-app-upgrade` (đọc CHANGELOG, chạy thử trên dev, sao lưu, đổi
  bản) — ghi `docs/nang-cap.md`.
- Đổi API key Dokploy trong Studio sau khi chủ dự án xoay key (thủ tục ghi trong `docs/trien-khai-vps.md`).

### S6.7 — Trả nợ kỹ thuật từ S1–S5 (~3 ngày, chia nhỏ, làm theo thứ tự ưu tiên)

1. Agent đề xuất tri thức (`kb offers`: agent đề nghị lưu file/ghi chú từ issue → người duyệt).
2. Tab Knowledge + Memory + Releases trong trang project (như demo).
3. UI sửa App id / release line của repo (API đã có).
4. Project memory đọc cả nhánh của issue (memory trong PR chưa merge).
5. Chuyển repo đang nối qua PAT sang GitHub App (chỉ dev còn dùng PAT) rồi gỡ PAT.
6. `DelegatedWrites` cho agent hội thoại (đề xuất tạo issue qua plan mà không cần quyền tạo trực tiếp); link kind "Linked
   work" cho hội thoại.
7. Kiểm chứng sống bản sửa "setup không chạy lại khi mở lại preview" (`de0fa41`) bằng một PR preview thật.
8. Tìm kiếm ngữ nghĩa trong KB — **chỉ khi chủ dự án chốt dịch vụ embedding** (tốn phí); mặc định để sau.

### S6.8 — (Hoãn) Testing menu, Zalo OA

Ghi lại phạm vi để làm sau nếu chủ dự án mở (Q7, Q8).

## 5. Thứ tự, thời lượng, cổng dừng

| Thứ tự | Bước                               | Thời lượng | Cổng (dừng hỏi chủ dự án)                                                       |
| ------ | ---------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| 1      | S6.1 Tiếng Việt + nhận diện        | 2 ngày     | Duyệt bảng thuật ngữ trước khi dịch hàng loạt; duyệt logo/màu                   |
| 2      | S6.2 Inbox, badge, Follow-ups      | 2,5 ngày   | —                                                                               |
| 3      | S6.3 Dashboard                     | 2,5 ngày   | —                                                                               |
| 4      | S6.4 Email, web push, báo cáo tuần | 1,5 ngày   | Trước lần gửi email/push thật đầu tiên; cần thông tin SMTP                      |
| 5      | S6.5 Ngân sách                     | 1,5 ngày   | Chốt mức ngân sách                                                              |
| 6      | S6.6 Vận hành                      | 1,5 ngày   | Trước khi cài cron/dịch vụ trên VPS; chủ dự án uỷ quyền rclone, tạo UptimeRobot |
| 7      | S6.7 Nợ kỹ thuật                   | 3 ngày     | Mục 8 (embedding) cần quyết định riêng                                          |

Tổng ≈ 14–15 ngày làm việc. S6.2–S6.3 làm liền khi chờ chủ dự án ở các cổng của S6.1/S6.4.

## 6. Kiểm chứng chung cho S6

- Chủ dự án dùng Studio một tuần bằng tiếng Việt: mọi việc cần quyết định đến được qua inbox (badge) + email/push, Dashboard
  phản ánh đúng các issue đã làm.
- Một issue thật trên `duongsinh-nocobase` (vd bổ sung bản dịch vi-VN còn thiếu cho trang phụ huynh) đi trọn quy trình,
  xuất hiện đúng trên Dashboard, Follow-ups, Releases (Pending release → production mark).
- Bảo mật: contributor không xem Dashboard toàn công ty; email chỉ tới thành viên; ngân sách không chặn nhầm run đang chạy.
- Vận hành: khôi phục thử từ bản sao lưu trên Google Drive vào DB tạm thành công; tắt thử runner → cảnh báo đến trong 10 phút.

## 7. Rủi ro

| Rủi ro                                                | Giảm thiểu                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Dịch thuật ngữ không thống nhất, khó hiểu             | Bảng thuật ngữ duyệt trước; giữ thuật ngữ kỹ thuật quen dùng (PR, merge, agent)     |
| Plugin upstream thiếu/đổi bản vi-VN khi nâng cấp beta | Bản dịch bổ sung nằm ở lớp app, có script kiểm key thiếu sau mỗi lần nâng           |
| Email bị đánh dấu spam / lộ địa chỉ                   | Gửi từ tên miền công ty có SPF/DKIM; chỉ gửi cho thành viên; giới hạn tần suất      |
| Ngân sách chặn nhầm việc gấp                          | Chủ dự án mở chặn bằng một nút; cảnh báo ở 80 % trước                               |
| VPS vẫn thiếu RAM khi thêm job giám sát/sao lưu       | Job nhẹ, chạy giờ thấp điểm (02:30), `nice`; đo trước/sau                           |
| NocoBase 3 beta đổi API giữa chừng                    | Ghim phiên bản; nâng theo `docs/nang-cap.md`; chạy đủ test trước khi đổi production |

## 8. Việc phụ thuộc / còn treo trước S6

- Chủ dự án: merge PR #1, #3 (rồi #2) của `duongsinh-nocobase`; merge DS-2; đổi API key Dokploy (rồi cập nhật
  `DOKPLOY_API_KEY` của compose `studio`); đổi mật khẩu admin Studio; bật lịch sao lưu (hoặc để S6.6 làm cùng Q5).
- Phần giải đấu đang sửa dở trên máy chủ dự án (commit `9c19812` chưa push) — đưa lên PR khi chủ dự án báo "giải đấu xong".
