# A. Kiểm toán ma sát giao diện — Dương Sinh Studio

- Nguồn: `/home/claude/duongsinh-studio`, nhánh `main` @ `20d20d7` (153 commit / 9 ngày). Chỉ đọc mã, không sửa, không commit.
- Góc nhìn: một chủ sở hữu duy nhất (Thầy Tường) giám sát agent, phần lớn từ điện thoại Android (PWA Chrome, `docs/cai-tren-dien-thoai.md`), đôi khi desktop. Than phiền: "chậm và khó theo dõi".
- Phương pháp: đọc `client/routes.ts`, `client/layouts/**`, `client/pages/**`, `client/hooks/**`, `client/extensions/**`, `client/locales/**`, `server/routes/**` (để xác nhận endpoint), `tests/client/**`, và các kế hoạch `docs/plans/2026-11-10-*`, `2026-11-11-*`, `2026-11-12-*`. Mọi nhận định đều kèm `file:line`.

## 0. Kết luận ngắn

1. **"Việc cần tôi" bị xé làm 4 nơi**, mỗi nơi một con số: Trang chủ (quyết định trên issue mình phụ trách), Hộp thư (thông báo + yêu cầu phát hành), huy hiệu "Phiên làm việc" (chat cần trả lời), huy hiệu "Phát hành" (chờ lên production). Không màn hình nào gom cả bốn. (`client/pages/home/index.tsx:26-151`, `client/layouts/app-layout.tsx:75-80`, `client/hooks/use-follow-ups.ts:78-118`).
2. **Sidebar 19 mục + 2 icon header lặp lại cùng huy hiệu**; các kế hoạch P/H được dựng từ ảnh demo desktop, không có một dòng nào về điện thoại (grep "điện thoại|mobile|di động" trong 4 file kế hoạch = 0 kết quả).
3. **Trang "Công việc của tôi" mặc định là khung chia đôi với cột trái cố định 320 px** — trên điện thoại 360–412 px, khung chi tiết bên phải gần như không còn chỗ (`client/pages/issues/issue-workspace.tsx:175`, `issue-split-view.tsx:328-330`).
4. **Trang issue dàn 10 khối dọc rồi mới tới tab; diễn biến bị tách 4 nơi** (Tiến độ / Hoạt động / Lượt chạy / Mã & xem thử); "Cần bạn" không ghim, phần ghim chỉ có nút Merge (`client/pages/issues/detail/index.tsx:234-252, 321-507`).
5. **Hộp thoại "Tạo công việc" mặc định mở tab "Dự thảo AI"** (plugin, `pm:new-issue-tab` trong localStorage), và vì Studio không bind organizer nên tab này **chia mỗi gạch đầu dòng thành một issue** — chính là vụ DS-25…DS-56 (`node_modules/@nocobase/app-plugin-projects/dist/client/pages/issues/new.js:13,58-64`; `.agents/rules/duongsinh-studio.md:59`). Studio chưa đặt `IssueCreationModeContext` (grep `client/` = 0).
6. **"Chậm" có nguyên nhân đo được**: mọi hook Studio đều polling (15/30/60 s) dù plugin đã phát realtime topic `pm:changes` và `agents:runs:<id>`; `refetchOnWindowFocus: false` toàn cục nên quay lại tab trên điện thoại phải chờ tới chu kỳ polling kế tiếp; endpoint đếm huy hiệu chạy `decisionsOn` với 2 query/issue × tới 50 issue trên **mỗi** lần gọi (`server/routes/inbox.ts:53, 263-300`); layout nạp tĩnh toàn bộ chat panel (composer, react-markdown, `agent-run-history.tsx` 1 818 dòng) vào bundle đầu.

## 1. Bảng điểm ma sát

Mức: **cao** = chặn việc giám sát hằng ngày trên điện thoại; **vừa** = làm chậm/rối nhưng có đường vòng; **thấp** = chất lượng. Công: ngày người (0.25 / 0.5 / 1 / 2).

| #  | Màn hình / luồng | Hiện trạng (file:line) | Vì sao đau trên điện thoại / với một chủ | Mức | Hướng sửa | Công |
| -- | --- | --- | --- | --- | --- | --- |
| 1 | Sidebar | 19 mục: 5 mục đầu + nhóm Phát triển (6) + Phát hành (2) + Quản trị agent (5) + Cài đặt. `client/routes.ts:150-336, 574-595`; nhóm tại `client/lib/navigation-transform.ts:42-59, 66-167`. Trên điện thoại là Sheet rộng 72 spacing (`client/layouts/components/app-sidebar.tsx:147`) | Mở hamburger phải cuộn mới thấy Phát hành/Agent; 5 mục đầu (Trang chủ, Hộp thư, Công việc của tôi, Phiên, Tổng quan) đều trả lời cùng một câu "tôi cần làm gì" theo 5 cách. Một người dùng không cần "Quản trị agent" mỗi ngày. | cao | Sidebar ≤ 8 mục (mục 2 dưới), phần còn lại vào Cài đặt hoặc tab con | 1 |
| 2 | Header | Hai icon Phiên + Hộp thư với huy hiệu **cùng số** với sidebar (`client/layouts/components/header-quick-links.tsx:44-66`), thêm nút Chat (`header-actions.tsx:14-18`). `useNavigationCounts` gọi 2 lần (layout + header) — cùng query key nên không gọi API trùng, nhưng UI trùng. | Cùng một số hiện ở 3 chỗ (sidebar Hộp thư, icon header, thẻ Trang chủ) mà ý nghĩa khác nhau: inbox = `decision + info` (`use-follow-ups.ts:97-100`), my-issues = `summary.waiting` (`:101-102`), Trang chủ = `summary.waiting` (`home/index.tsx:32`). Chủ không biết tin số nào. | vừa | Một huy hiệu duy nhất "Cần tôi" = tổng (quyết định issue + chat cần trả lời + yêu cầu phát hành) trên mục "Hôm nay"; bỏ 2 icon header trên mobile, giữ nút Chat | 0.5 |
| 3 | Trang chủ `/` | 2 thẻ: "Cần tôi quyết định" (5 mục, chỉ từ `/api/inbox/waiting`) + "Đang làm" chỉ là **một con số** và nút "Mở công việc của tôi" (`client/pages/home/index.tsx:109-151`). Không có: chat cần trả lời (`agents/conversationAttention`), phát hành chờ (`/api/attention`), agent nào đang chạy gì (`/api/agentBoard`). | Từ Trang chủ, muốn biết agent đang làm gì phải thêm 2–3 chạm (hamburger → Công việc của tôi → chọn issue). Nếu thứ cần mình là một yêu cầu phát hành hay một câu hỏi trong chat thì Trang chủ **im lặng**. | cao | Thay bằng trang "Hôm nay" 3 khối (mục 3) | 1 |
| 4 | Trang chủ — làm mới | `refetchInterval: 30_000`, nhưng ghi chú "and when it regains focus" là sai: `refetchOnWindowFocus: false` toàn cục (`node_modules/@nocobase/app-client/dist/query-client.js:9`) và hook không bật lại (`client/hooks/use-my-work.ts:15-33`). | Mở lại PWA từ màn hình khoá → thấy số cũ tối đa 30 s (huy hiệu: 60 s). Người dùng kết luận "chậm". | vừa | `refetchOnWindowFocus: true` + `refetchOnReconnect` cho các query "cần tôi"; hoặc subscribe realtime (xem #22) | 0.25 |
| 5 | Công việc của tôi `/my-issues` | Mặc định `split` (`client/pages/issues/issue-workspace.tsx:169-176`). Khung chia đôi: `h-[calc(100vh-12rem)]`, cột trái `w-80 shrink-0 … lg:w-96` không có nhánh mobile (`issue-split-view.tsx:328-330`); `useIsMobile` không được dùng trong `client/pages/issues/**` (grep = 0). Chân cột trái in phím tắt J/K/S/Enter (`:320-325, 490-502`). | Trên 390 px: cột trái 320 px + lề → khung phải còn ~0–40 px, `overflow-hidden` nuốt mất chi tiết; phím tắt vô nghĩa trên cảm ứng. Đây là trang chủ cũ của "việc của tôi" nên đau hằng ngày. | cao | Dưới `md`: danh sách nhóm (wait/doing/backlog/done) toàn màn hình, chạm → trang issue; ẩn chân phím tắt. Giữ split cho ≥ `lg`. | 0.5 |
| 6 | Công việc `/issues` (bảng nhóm) | `Table className='table-fixed'` với cột cố định `w-40 + w-36 + w-44 + w-28` = 592 px trước cột tiêu đề (`client/pages/issues/issue-grouped-list.tsx:214-229`); không `max-md:hidden` như `issue-table.tsx:383-384` đã làm. | Tiêu đề issue bị bóp về 0 hoặc phải cuộn ngang. | vừa | Ẩn Dự án/Người thực hiện dưới `md`, hoặc dùng `IssueCard` dạng thẻ dưới `md` | 0.25 |
| 7 | Công việc — thanh công cụ | 1 ô tìm + tới 5 Select lọc + ToggleGroup 4 kiểu xem (Chia đôi/Danh sách/Bảng/Hàng đợi agent) (`issue-workspace.tsx:192-260`). | Trên điện thoại toolbar cao ~3 hàng trước khi thấy dòng đầu. Bốn kiểu xem cho một người là thừa. | thấp | Mobile: tìm + 1 nút "Lọc" mở Sheet; ẩn Hàng đợi/Chia đôi dưới `md` | 0.5 |
| 8 | Trang issue — thứ tự khối | Trước tab có 10 khối dọc: Header (tiêu đề `text-2xl`, 3 nút Theo dõi/Hỏi agent/Xoá), SecretFindingsBanner, Tiến độ, Báo cáo bàn giao, **Tiêu chí nghiệm thu (luôn hiện, kể cả rỗng)**, chip thuộc tính, AddBar, Việc con, Phụ thuộc, Đính kèm, KB offers (`client/pages/issues/detail/index.tsx:257-454`; tiêu chí luôn render: `client/components/criteria/criteria-editor.tsx:252-281`, loading là chuỗi `'...'` tại `:268`). | Trên điện thoại phải cuộn 2–3 màn mới tới Hoạt động (nơi agent trả lời). Khối rỗng "Chưa có tiêu chí nghiệm thu / Thêm tiêu chí" chiếm chỗ trên mọi issue. | cao | Thứ tự mobile: Tiến độ+Cần bạn → Hoạt động (mới nhất) → còn lại gập. Tiêu chí: `return null` khi rỗng và không có quyền sửa; khi có quyền thì gập thành 1 dòng "Thêm tiêu chí". | 0.5 |
| 9 | Trang issue — "Cần bạn" không ghim | `IssueProgressPanel` nằm trong luồng thường (`index.tsx:321-334`); header dính chỉ hiện trạng thái + mã + `IssueMergeButton` + Về đầu trang (`issue-sticky-header.tsx:13-53`, `index.tsx:234-252`); xuất hiện sau 160 px cuộn (`issue-scroll.ts:72`). | Khi đọc Hoạt động ở dưới, không thấy "Cần bạn: …" và các nút Nhận/Trả lại/Thử lại; chỉ có Merge. | vừa | Đưa `progress.needsYou` + nút hành động chính vào `IssueStickyHeader` (dữ liệu đã có từ `useIssuePanels`). | 0.25 |
| 10 | Trang issue — diễn biến tách 4 nơi | Tiến độ (`issuePanels/:id`), tab Hoạt động (comment + activity, gập "N bản ghi hệ thống"), tab Lượt chạy (`issueRuns?issue=` + transcript theo lượt), tab Mã & xem thử (PR, preview, release) (`index.tsx:455-507`; `issue-runs.tsx:245-268`; `issue-activity.tsx`). Tab Lượt chạy chỉ mount khi mở → polling 15 s chỉ chạy khi đứng ở tab đó. | Muốn trả lời "agent vừa làm gì, lỗi ở đâu, PR nào" phải chuyển 3 tab. Không có một dòng thời gian hợp nhất. | cao | Một tab "Diễn biến" gộp theo thời gian: comment, activity, run (bắt đầu/kết thúc/lỗi + 1 dòng tóm tắt, bấm mở transcript), PR/CI/preview. Giữ "Mô tả" và "Mã & xem thử" là tab phụ. | 2 |
| 11 | Trang issue — Mô tả ẩn sau tab | Tab mặc định `activity`; Mô tả là tab 2 (`index.tsx:222, 463-465, 475-490`). | Mở issue từ thông báo, chủ không thấy issue nói về gì nếu không chạm thêm. | thấp | Hiện 3 dòng đầu Mô tả (gập/mở) ngay dưới tiêu đề; tab Mô tả giữ để sửa. | 0.25 |
| 12 | Trang issue — hoạt động cũ → mới | `useIssueTimeline` xếp cũ nhất trước, composer ghim dưới (`issue-activity.tsx:1-4, 357-383`); link "Xem giải thích mới nhất của Lead Agent" phải `scrollIntoView` qua DOM (`issue-needs-you.tsx:54-67`, `issue-scroll.ts:61-69`). | Trên điện thoại: mở tab Hoạt động rồi phải cuộn xuống cuối để thấy câu trả lời mới nhất. | vừa | Mobile: tự cuộn tới comment agent mới nhất khi mở tab, hoặc nút nổi "Mới nhất ↓". | 0.25 |
| 13 | Tạo công việc — tab mặc định "Dự thảo AI" | Plugin: `TABS = ['ai','manual']`, mặc định `storedTab() ?? 'ai'` (`node_modules/@nocobase/app-plugin-projects/dist/client/pages/issues/new.js:13-14, 58-64`). Studio không đặt `IssueCreationModeContext = 'manual'` (grep `client/` = 0). Không bind organizer → tab AI chỉ "chia theo quy tắc": mỗi dòng gạch đầu dòng = 1 issue (`docs/plans/research/2026-11-08/A-agents-runtimes-sessions.md:91`, `.agents/rules/duongsinh-studio.md:59`, `docs/plans/2026-11-07-studio-khac-phuc-ton-dong.md:122`). Chính test e2e cũng phải ép `?tab=manual` (`tests/playwright/issue-flow.test.ts:27`). | Dán một prompt dài → 32 issue (DS-25…DS-56) rồi phải huỷ tay. Quy tắc nội bộ đã ghi "đừng làm thế" nhưng UI vẫn dẫn vào đó mặc định. | cao | (a) Bọc route `issues/new` trong `IssueCreationModeContext.Provider value='manual'` (plugin xuất từ `kit`), hoặc (b) đổi nhãn/tab: "Một công việc" (mặc định) và "Tách thành nhiều công việc" kèm cảnh báo "Mỗi dòng gạch đầu dòng = 1 công việc"; (c) `NewIssueButton` luôn link `?tab=manual`. | 0.25 |
| 14 | Hộp thư | Mặc định `view='all'` (mọi thông báo) chứ không phải `todo` (`client/extensions/nocobase-inbox/model.ts:211-216`); huy hiệu lại đếm `decision + info`. `BudgetStops` chèn trên đầu (`client/pages/inbox.tsx:27-34`). | Mở Hộp thư thấy cả thông báo đã đọc/thông tin; phải tự chuyển sang "Cần làm". | vừa | Mặc định `?view=todo` khi có quyết định chờ; huy hiệu chỉ đếm `decision`. | 0.25 |
| 15 | Theo dõi `/follow-ups` | Trang riêng, trùng dữ liệu với nhóm "Cần bạn/Đang làm" của taskGroups; nhóm dùng từ khác (`followUps.group.backlog: 'Backlog'`, `vi-VN.ts:845`). | Thêm một nơi nữa để nhìn cùng danh sách; một người dùng theo dõi… chính mình. | thấp | Gộp thành bộ lọc "Đang theo dõi" trong Công việc; bỏ mục sidebar. | 0.25 |
| 16 | Dự án — 7 tab | Overview/Issues/Knowledge/Memory/Members/Releases/Settings (`client/routes.ts:81-145`; `projects/detail/tabs.tsx:20-23` `flex-wrap`). Thêm 2 mục sidebar riêng "Ghi nhớ dự án" và "Thiết lập dự án" lặp nội dung tab Memory và nút "Dự án mới". | Tab gãy 2 hàng trên điện thoại; "Thành viên" vô nghĩa với một người. | vừa | Mobile: tab dạng Select/cuộn ngang; gộp Memory vào Tri thức; ẩn Members khi dự án 1 thành viên; "Thiết lập dự án" = nút trong /projects. | 0.5 |
| 17 | Tổng quan `/dashboard` | 677 dòng, 4 report + ngân sách + bench; bảng Dự án 6 cột `w-48` (`client/pages/dashboard/index.tsx:606-625`) chỉ cuộn ngang. | Nặng và là "báo cáo tuần", không phải "hôm nay". Khối "Cần chú ý" (`reports/attention`) lại rất hợp trang Hôm nay. | thấp | Giữ nguyên nhưng chuyển xuống nhóm phụ; mượn `reports/attention` cho Hôm nay. | 0 |
| 18 | Cài đặt → Playbooks / Kiểm chứng / Phiếu review / Bài học | Playbooks chỉ đọc, cột "Công việc" in `inv.issueId` thô, `toLocaleString()` không locale (`client/pages/settings/playbooks.tsx:191-222`); Kiểm chứng in `item.issueId` thô (`verifications.tsx:211, 237`); Bài học: placeholder tiếng Anh cứng `'e.g. migration, security, testing'` (`client/components/propose-lesson-dialog.tsx:105`); `projects-general.tsx:121` placeholder `'STOP'`. Chỉ có test route cho playbooks/verifications (`tests/client/client-routes.test.ts`, `foundation-integration.test.ts`), lessons 1 test. | Chủ không thể từ lịch sử bấm sang issue; không biết `!<slug>` nào dùng cho việc gì nếu không đọc mô tả skill. | vừa | In `identifier` + link `/issues/:id`; locale cho ngày; chuyển placeholder vào `lessons.tagPlaceholder`; thêm nút "Dùng playbook này" chèn `!slug` vào composer issue. | 0.5 |
| 19 | Cài đặt — Biến môi trường/bí mật | Nhập qua `VariablesSection` của plugin, chỉ ở tab Settings của dự án (`client/pages/projects/project-agent-settings.tsx:38-49`) và chỉ khi `canManage`. | Không có lối từ sidebar; chủ phải nhớ "Dự án → Cài đặt → cuộn". Chấp nhận được vì ít dùng. | thấp | Thêm thẻ "Biến & bí mật" trong Cài đặt → Agent & vận hành trỏ tới tab đó. | 0.25 |
| 20 | Polling thay vì realtime | `use-issue-work.ts:135` 15 s (panels, runs, agentBoard); `use-task-groups.ts:91` 30 s; `use-my-work.ts:16` 30 s; `use-follow-ups.ts:36` 60 s. Plugin đã có topic `pm:changes` (`node_modules/@nocobase/app-plugin-projects/dist/shared/realtime.js:6`) và `agents:runs:<runId>` (`…/app-plugin-agents/dist/shared/realtime.js:2-4`); Studio không subscribe (grep `pm:changes|runTopic|watchReadiness` trong `client/hooks` = 0). Inbox của plugin thì có realtime (`…/notification-in-app/dist/client/inbox/use-inbox.js:120-177`). | Trạng thái run hiện trễ tới 15 s; huy hiệu trễ tới 60 s; pin điện thoại tốn vì poll nền. | vừa | Subscribe `pm:changes` + `agents:runs:<id>` → `invalidateQueries` cho panels/runs/task-groups/badges; giữ polling thưa (60–120 s) làm dự phòng. | 1 |
| 21 | Chi phí server mỗi lần đếm huy hiệu | `/inbox/pending`, `/inbox/waiting`, `/taskGroups/summary`, `/taskGroups` đều gọi `decisionsOn` → `Promise.all` 2 query (activities limit 50 + runs limit 20) **cho từng** issue mở mình phụ trách, tối đa `DECISION_SCAN = 50` (`server/routes/inbox.ts:53, 263-300`); `rowsOf` thêm `unreadComments` cho từng issue đang theo dõi (`:567-595`). Trang chủ gọi `taskGroups/summary` (30 s) và `inbox/pending` (60 s) với query key khác nhau nên không gộp. | Với 30–40 issue mở, mỗi phút server chạy ~300–400 query chỉ để ra 3 con số. Đây là phần "chậm" nhìn thấy khi mở app. | vừa | Cache `decisionsOn` 10–20 s theo user (in-memory), hoặc một endpoint `/api/me/today` trả cả 3 số + danh sách trong một lần; client dùng chung một query key. | 0.5 |
| 22 | Bundle đầu nạp cả chat | `client/layouts/app-layout.tsx:9-10` import tĩnh `ChatPanel` + `ChatFloatingButton` → `conversation-view.tsx:59-62` → `composer.tsx` (1 025 dòng), `live-steps.tsx:11` → `#components/agent-run-history` (1 818 dòng), `chat-markdown` → `react-markdown` + `remark-gfm` (`client/components/markdown-view.tsx:10-11`). Không có `lazy()` trong `client/layouts` (grep = 0). | Mọi trang, kể cả Trang chủ trên 4G, tải trước toàn bộ chat. | vừa | `React.lazy` cho `ChatPanel`/`ConversationView`; chỉ nạp khi bấm Chat hoặc vào `/sessions`. | 0.5 |
| 23 | Trang issue — số request khi mở | Mở 1 issue: issue detail (plugin) + `issuePanels/:id` + `git/pullRequests?issueId` (2 nơi, dedupe) + `issues/:id/secret-findings` + `issues/:id/criteria` + `kb/offers` + (screenshots nếu có báo cáo) + plan lookup/executor options; `issuePanels` poll 15 s. | 7–9 request tuần tự-song song trước khi trang "đứng yên"; trên 4G mỗi lần mở issue chờ 1–2 s. | thấp | Gộp criteria/secret-findings/kb-offers vào `issuePanels` (đã là endpoint "panels"), hoặc `staleTime` 15 s cho các query phụ. | 0.5 |
| 24 | Tên nhóm trạng thái không đồng nhất | Cùng một trạng thái có 3 từ: `issues.groups` 'Đang thực hiện/Tồn đọng/Đã hoàn thành/Đang duyệt/Bị chặn' (`vi-VN.ts:960-968`) vs `followUps.group` 'Đang làm/Backlog/Chờ nghiệm thu/Đang vướng' (`:841-846`) vs trạng thái chuẩn (overrides `status`: 'Chờ làm/Đang làm/Đang vướng/Chờ nghiệm thu/Xong'). | Chủ nhìn "Tồn đọng" ở Công việc, "Backlog" ở Theo dõi, "Chờ làm" trong chip — tưởng ba thứ khác nhau. | vừa | Một bảng từ duy nhất theo `docs/thuat-ngu.md`; thêm test parity cho các nhóm. | 0.25 |

Số chạm từ lúc mở app tới "cái gì cần tôi ngay":
- Quyết định trên issue mình phụ trách: Trang chủ → chạm issue = **1 chạm** + cuộn tới Hoạt động (≈2 màn).
- Câu hỏi trong chat: icon header → chọn phiên = **2 chạm** (Trang chủ không báo).
- Yêu cầu phát hành: hamburger → Phát hành → tab "Chờ phát hành" = **3 chạm** (Trang chủ không báo; Hộp thư có feed `releaseRequestsFeed` nhưng mặc định xem "all").
- Lượt chạy lỗi không thuộc issue mình phụ trách (owner là agent/người khác): **không có đường** ngoài Tổng quan → Cần chú ý (`reports/attention`).

## 2. Sidebar đề xuất (≤ 8 mục)

| # | Mục mới | Đường dẫn | Chứa gì | Mục hiện có chuyển về đây |
| - | --- | --- | --- | --- |
| 1 | **Hôm nay** (huy hiệu = tổng Cần tôi) | `/` | Trang 3 khối (mục 3) | Trang chủ, Hộp thư (phần quyết định), Theo dõi, huy hiệu Phiên/Phát hành |
| 2 | **Công việc** | `/issues` | Danh sách nhóm (mobile) / bảng nhóm (desktop); bộ lọc "Của tôi", "Đang theo dõi"; kiểu xem Bảng/Hàng đợi là tuỳ chọn | Công việc, Công việc của tôi (`/my-issues` giữ URL, redirect `/issues?mine=1`), Theo dõi |
| 3 | **Phiên chat** | `/sessions` | Như hiện tại (đã có mobile) | Phiên làm việc, mục "Agent trên máy tôi" của plugin |
| 4 | **Dự án** | `/projects` | Danh sách + nút "Dự án mới"/"Thiết lập nhanh"; tab dự án gồm Tổng quan, Công việc, Tri thức (gộp Ghi nhớ), Phát hành, Cài đặt | Dự án, Thiết lập dự án, Ghi nhớ dự án |
| 5 | **Phát hành** | `/releases` | Tab: Chờ phát hành · Preview/Staging · Môi trường | Phát hành, Môi trường |
| 6 | **Tri thức** | `/knowledge` | Không gian chung + theo dự án | Tri thức, Ghi nhớ dự án (nếu không gộp vào Dự án) |
| 7 | **Báo cáo** | `/dashboard` | Tổng quan + Bench + Mức sử dụng | Tổng quan, Mức sử dụng (agents plugin) |
| 8 | **Cài đặt** | `/settings` | Thêm thẻ nhóm "Agent & vận hành": Agent, Runner, Skill, Mô hình, Playbooks, Bài học, Kiểm chứng, Phiếu review, Ngân sách, Trưởng nhóm agent, Biến & bí mật | Agent, Runner, Skill, Mô hình (chuyển `navigation` sang `parent: 'settingsAi'` — các route `agentsRoute/runtimesRoute/skillsRoute/modelsRoute` giữ nguyên path/grant, chỉ đổi `parent`), Hộp thư phần "info" thành nút chuông trong header |

Thực thi: chỉ sửa `client/routes.ts` (khai báo `parent`/`navigation`) và `client/lib/navigation-transform.ts` (bỏ 3 nhóm, giữ `groupFoundationNavigation`); **không đổi** `name`/`authz` của route để không phải migrate page grant (`AGENTS.md` mục Pages and routes). Thêm test ở `tests/client/sidebar-permissions.test.tsx` cho số mục ≤ 8.

## 3. Trang "Hôm nay" — đặc tả một màn hình, 3 khối

Mục tiêu: trả lời trong **một màn điện thoại, không chạm**: (1) cái gì cần tôi, (2) agent đang làm gì, (3) cái gì vừa xong / vừa hỏng. Dùng toàn endpoint đã có (xác nhận trong `server/routes/**` và plugin).

### Khối 1 — "Cần tôi" (trên cùng, nền nhấn)
- Nguồn:
  - `GET /api/inbox/waiting` → danh sách quyết định trên issue (`server/routes/inbox.ts:777-806`; mỗi mục có `entry.item.title/body`, `notice.type` ∈ accept/answer/failed/takeOver/limited, link qua `entryLink`).
  - `GET /api/inbox/pending` → `{ decision, info }` (`:731-755`).
  - `GET /api/agents/conversationAttention` → `{ unread, needsYou }` (plugin agents, đã dùng ở `use-follow-ups.ts:92-95`).
  - `GET /api/attention` → `{ count, reasons[{reason, count, path}] }` với `deployment_requested` → `/inbox?kind=decision`, `pendingRelease` → `/releases?tab=pending` (`server/routes/deploys.ts:1911-1955`).
- Hiển thị: 1 dòng tổng "Cần tôi: N"; dưới là tối đa 5 hàng, mỗi hàng = loại (badge: Nghiệm thu / Trả lời / Lượt chạy lỗi / Bàn giao / Phát hành / Chat) + tiêu đề + link thẳng. Hàng chat và phát hành lấy từ 2 endpoint sau, trộn vào cùng danh sách. "Xem tất cả" → `/inbox?view=todo`.
- Khi N = 0: một dòng "Không có gì cần bạn." và khối co lại.

### Khối 2 — "Agent đang làm" (giữa)
- Nguồn: `GET /api/agentBoard` (`server/routes/issue-work.ts:736-909`) → `summary {waiting, working, queued, idle}` và `rows[]` với `state`, `issue{identifier,title,id}`, `run{since, runnerName, lastActivity.text}`, `queue{reason, position, until}`, `waiting{kind, viewerDecides, detail}`. Hook sẵn: `useAgentBoard` (`client/hooks/use-issue-work.ts:188-206`). Có thể lọc `involvesUserId`.
- Hiển thị: dòng tóm tắt "Đang làm {working} · Chờ runner {queued} · Chờ người {waiting}"; tối đa 5 hàng `working`+`queued`: tên agent · `DS-xx` tiêu đề · "từ {since}" · 1 dòng `lastActivity.text` (cắt 80 ký tự). Chạm → `/issues/:id` (mở tab Diễn biến).
- Khi runner offline: dòng cảnh báo lấy từ `queue.reason` (đã có nhãn `issueWork.queue.*` trong `vi-VN.ts:105-134`).

### Khối 3 — "Vừa xong / vừa hỏng (24 h)" (dưới)
- Nguồn:
  - `GET /api/reports/attention` → `blocked`, `overdue`, `reviewWaits`, `failedRuns` (mỗi mục `total` + 5 item; `server/routes/reports.ts:566-580`, hook `useAttentionReport` `client/hooks/use-reports.ts:136-137`). `failedRuns` là nguồn cho "lượt chạy lỗi chưa quyết" kể cả issue không do mình phụ trách.
  - `GET /api/taskGroups?mode=split` nhóm `done` (`server/routes/inbox.ts:1244-1340`, hook `useTaskGroups`) cho "vừa xong"; hoặc `GET /api/followUps` (`:843-920`, trả `issues[]` có `unread`, `lastActivityAt`).
- Hiển thị: 2 cột trên desktop, 2 dòng trên mobile: "Lỗi/đứng: {failedRuns.total + blocked.total}" (3 hàng đầu, link issue/PR) · "Xong hôm nay: {k}" (3 hàng đầu). Link "Báo cáo đầy đủ" → `/dashboard`.

### Kỹ thuật
- Một hook `useToday()` gộp 5 request bằng `Promise.allSettled` dưới **một** query key (như `useNavigationCounts` đã làm), `refetchOnWindowFocus: true`, `refetchInterval` 60 s, và invalidate khi nhận `pm:changes`. Huy hiệu sidebar "Hôm nay" đọc từ cùng cache → bỏ `BADGES_KEY` riêng.
- Nếu muốn giảm tải server (ma sát #21): thêm `GET /api/me/today` trả cả 3 khối trong một lần, tái dùng `decisionsOn` một lần duy nhất.
- Trang giữ `authz: 'skip'` như Trang chủ hiện tại (`client/routes.ts:151-160`); mỗi khối tự ẩn khi endpoint trả 403.
- Test: mở rộng `tests/client/home.test.tsx` (hiện 6 case, fixture sẵn cho `inbox/waiting` + `taskGroups/summary`) thêm fixture `agentBoard`, `attention`, `reports/attention`; thêm 1 case viewport 390 px kiểm tra 3 khối xếp dọc và không có `overflow-x`.

## 4. Chuỗi vi-VN đọc như dịch máy hoặc không nhất quán (≤ 20)

Ghi chú: phần "dịch máy" nặng nhất nằm ở bản vi-VN **của plugin** chưa được đè; `client/locales/overrides/vi-VN.ts` mới đè một phần. Các khoá dưới là khoá plugin trừ khi ghi rõ file Studio.

| # | Khoá | Hiện tại | Vấn đề | Đề nghị |
| - | --- | --- | --- | --- |
| 1 | `@nocobase/app-plugin-projects` `newIssue.tabs.ai` / `.manual` (`…/dist/client/locales/vi-VN.js:473-476`, chưa đè) | "Dự thảo AI" / "Thủ công" | Không nói tab AI sẽ **tách nhiều** issue | "Tách thành nhiều công việc" / "Một công việc" |
| 2 | projects `nav.general` (`:462`, chưa đè) | "Đại tướng" | General → tướng quân | "Chung" |
| 3 | projects `plans.status.pending` / `.executing` (`:903-904`, chưa đè) | "Chờ em" / "Thi hành" | Pending → "chờ em" | "Đang chờ" / "Đang thực hiện" |
| 4 | projects `intake.resplit` / `intake.splitting` (`:1087-1089`, chưa đè) | "Chia tay lần nữa" / "Tách ra…" | Re-split → "chia tay" | "Tách lại" / "Đang tách…" |
| 5 | projects `intake.splitAction` (đè tại `overrides/vi-VN.ts:897`) | "Công việc dự thảo" | Là nút hành động, đọc như danh từ | "Soạn nháp công việc" |
| 6 | projects `myIssues.tabs.executing` (`:455`, chưa đè) | "Tôi thi hành" | "thi hành" = án | "Tôi thực hiện" |
| 7 | projects `plans.flags.agentExecutor` (`:998`, chưa đè) | "Làm cho một đại lý trở thành người thi hành án" | agent → đại lý; executor → thi hành án | "Giao cho một agent thực hiện" |
| 8 | agent-sessions `newSession.agentsHint` (`overrides/vi-VN.ts:33-34`) | "Cây cầu kiểm tra từng phút…" | bridge → cây cầu | "Cầu nối kiểm tra mỗi phút…" |
| 9 | agent-sessions `session.startup.opening` (`overrides/vi-VN.ts:39`) | "Khai mạc phiên agent…" | opening → khai mạc | "Đang mở phiên agent…" |
| 10 | agent-sessions `newSession.accessHint` (`overrides/vi-VN.ts:26-27`) | "…như trong thiết bị đầu cuối của riêng bạn" | terminal → thiết bị đầu cuối | "…như trong terminal của bạn" |
| 11 | agents plugin, nhiều khoá (`overrides/vi-VN.ts:146, 166, 375, 385, 419, 452`) | "đặc vụ" | agent → đặc vụ, trái `docs/thuat-ngu.md` ("Agent, không dịch") | "agent" |
| 12 | Studio `issues.groups.*` (`client/locales/vi-VN.ts:960-968`) vs `followUps.group.*` (`:841-846`) vs `status.*` (overrides `:839-847`) | "Tồn đọng" / "Backlog" / "Chờ làm"; "Bị chặn" / "Đang vướng"; "Đang duyệt" / "Chờ nghiệm thu" | Ba bộ từ cho một trạng thái | Dùng bộ `status.*`: Chờ làm / Đang làm / Đang vướng / Chờ nghiệm thu / Xong |
| 13 | Studio `navigation.followUps` (`:902`) | "Theo dõi" | Trùng với nút "Theo dõi" trên issue; glossary ghi "Đang theo dõi" | "Đang theo dõi" |
| 14 | Studio `navigation.mySessions` (`:865`) vs overrides `navigation.agentSessions` (`overrides:8`) | "Phiên làm việc" vs "Agent trên máy tôi" | Hai mục cùng nghĩa "phiên" | "Phiên chat" cho `/sessions`; ẩn mục plugin |
| 15 | Studio `bench.forceRunPrompt` / `forceRunConfirm` (`:278-280`) | "chạy cưỡng chế" | "cưỡng chế" là từ pháp lý | "chạy vượt hạn mức" |
| 16 | Studio `lessons.target` / `lessons.targets.*` (`:299, 318-323`) | "Đích chuyển hoá", "Kỹ năng agent (skill)" | Lai Anh–Việt trong ngoặc; "chuyển hoá" khó hiểu | "Áp dụng vào": Skill / Tri thức / Đường dẫn nhạy cảm / Tiêu chí dự án |
| 17 | Studio `bench.title` / `bench.description` (`:235-237`) | "Bộ đo harness" | Thuật ngữ nội bộ lọt ra UI | "Bộ kiểm tra chuẩn (10 việc)" |
| 18 | Studio: "Lỗi" / "Thất bại" / "Không đạt" cho `failed` (`issueWork.runs.status.failed:97`, `bench.status.failed:273`, `settingsVerifications.failed:750`, `studioVerifications.status.failed:712`, `dashboard.runs.failed:208`) | ba từ cho một trạng thái | | Lượt chạy: "Lỗi"; kiểm chứng/bench: "Không đạt" |
| 19 | Studio chính tả: "Hủy" (`studioCriteria.cancel:694`) vs "Huỷ" (13 chỗ); "Xóa" (`:695`) vs "Xoá" (22 chỗ) | | Hai cách bỏ dấu | Thống nhất "Huỷ"/"Xoá"; thêm lint chuỗi |
| 20 | Mã cứng tiếng Anh: `client/components/propose-lesson-dialog.tsx:105` `placeholder='e.g. migration, security, testing'`; `client/pages/settings/projects-general.tsx:121` `placeholder='STOP'` | | Không qua khoá dịch, trái `AGENTS.md` mục User-facing text | `lessons.tagPlaceholder`, `issuePrefix.placeholder` |

Thêm: `issueWork.needsYou` "Cần bạn" (`:19`) · `myHome.waiting.title` "Cần tôi quyết định" (`:558`) · `issues.groups.waitingForYou` "Cần bạn xử lý" (`:961`) · `issueWork.queue.group.waiting` "Chờ con người" (`:108`) — bốn cách gọi cùng một thứ; chọn một ("Cần tôi") và dùng làm tên khối/huy hiệu.

Kiểm chứng sẵn có: `tests/client/vi-plugin-overrides.test.ts` (4 case) và `locale-parity.test.ts`; nên thêm case cấm các từ "Vấn đề/đặc vụ/thi hành/Đại tướng" xuất hiện ở các khoá người dùng nhìn thấy.

## 5. Không nên đổi

1. **Mô hình quyền và tên route**: `name`, `authz`, page grant (`pm-issues`, `pm-my-issues`, `pm-projects`, `rel-apps`, `reports`) — đổi tên là phải migrate grant (`AGENTS.md`, `client/pages/settings/page-permission-titles.ts`). Sắp xếp lại sidebar chỉ qua `navigation`/`parent`.
2. **Trang Phiên chat `/sessions`**: đã xử lý mobile đúng (`useMediaQuery(CHAT_MOBILE_QUERY)`, `hidden md:flex`, `client/pages/sessions/index.tsx:200, 335-336, 551`) và là nơi duy nhất có realtime ổn. Dùng làm mẫu cho khung chia đôi của Công việc.
3. **Hộp thư của plugin (`nocobase-inbox` extension)**: đã có realtime, `max-lg:hidden` cho hai cột (`inbox-page.tsx:451-452, 511`), animation mục mới. Chỉ đổi mặc định `view=todo` và cách đếm huy hiệu.
4. **Khối "Tiến độ" + "Cần bạn" trên trang issue** (`issue-progress.tsx`, `issue-needs-you.tsx`) và các nút Merge/Đánh dấu đã merge/Xem thay đổi: đúng việc, có test (`tests/client/issue-detail-p2.test.tsx:348`, `issue-work.test.tsx` 11 case). Chỉ ghim lên header dính.
5. **Lớp dữ liệu harness H** (criteria, verifications, lessons, playbooks, secret findings, bench) và server routes của chúng: giữ nguyên API; chỉ sửa cách bày (gập khi rỗng, link issue, placeholder).
6. **`client/locales/overrides/vi-VN.ts` + hàm `merge`**: cơ chế đè đúng; chỉ bổ sung khoá, không viết lại.
7. **Bảng thuật ngữ `docs/thuat-ngu.md`** (đã duyệt 03/11): là chuẩn; sửa UI theo nó chứ không sửa nó.
8. **Quy tắc "không tạo issue từ prompt dài qua intake"** (`.agents/rules/duongsinh-studio.md:59`): đúng; việc cần làm là để UI mặc định tuân theo (ma sát #13), không gỡ tab AI.
9. **PWA manifest và Web push** (`docs/cai-tren-dien-thoai.md`, `tests/project/pwa-manifest.test.ts`): đang chạy; trang Hôm nay chỉ cần là đích của thông báo.
10. **Phím tắt desktop** (J/K/S/Enter, ⌘K, ⌘J): giữ cho desktop, chỉ ẩn phần hướng dẫn dưới `md`.

## 6. Phụ lục

### 6a. Bản đồ polling hiện tại (client)
| Hook | Endpoint | Chu kỳ | Mount ở đâu |
| --- | --- | --- | --- |
| `useNavigationCounts` (`use-follow-ups.ts:81-118`) | `inbox/pending`, `taskGroups/summary`, `attention`, `agents/conversationAttention` | 60 s | mọi trang (layout + header) |
| `useMyWorkSummary` / `useWaitingDecisions` (`use-my-work.ts`) | `taskGroups/summary`, `inbox/waiting` | 30 s | Trang chủ |
| `useTaskGroups` (`use-task-groups.ts`) | `taskGroups?mode=split\|table` | 30 s | Công việc / Công việc của tôi |
| `useIssuePanels`, `useIssueRuns`, `useAgentBoard` (`use-issue-work.ts`) | `issuePanels/:id`, `issueRuns`, `agentBoard` | 15 s | trang issue, tab Lượt chạy, kiểu xem Hàng đợi |
| `usePreviews` (`use-releases.ts:405-422`) | `previews` | 15 s chỉ khi đang deploy | tab Mã & xem thử, Phát hành |
| Inbox plugin (`use-inbox.js`) | realtime `in-app` topic + `staleTime 30 s` | realtime | Hộp thư |

Chưa dùng: `pm:changes` (projects), `agents:runs:<runId>`, `agents:runners` (agents).

### 6b. Test đang có cho các màn hình trong báo cáo
- Trang chủ: `tests/client/home.test.tsx` (6 case, không có viewport mobile).
- Trang issue: `issue-detail-p2.test.tsx` (7), `issue-work.test.tsx` (11), `criteria-editor.test.tsx` (3), `secret-findings-banner.test.tsx`, `issue-kb-offers.test.tsx`.
- Khung chia đôi: `issue-split-view.test.tsx` (6; case `:280` khẳng định mặc định split — sẽ phải đổi khi sửa #5).
- Sidebar/khung: `navigation-menu.test.tsx`, `sidebar-permissions.test.tsx`, `app-layout-routes.test.tsx`, `header-quick-links.test.tsx` (các test có `matchMedia` chỉ ở lớp shell).
- Harness H: `lessons-settings.test.tsx` (1), `bench-section.test.tsx`; Playbooks/Verifications/Reviews chỉ có test đăng ký route.
- Locale: `vi-plugin-overrides.test.ts` (4), `locale-parity.test.ts`, `app-locale-coverage.test.ts`.
- E2E: `tests/playwright/issue-flow.test.ts` (1, cần `?tab=manual`).

### 6c. Thứ tự làm đề nghị (tổng ≈ 6 ngày cho phần "cao" + "vừa" quan trọng)
1. #13 tab mặc định Thủ công (0.25) → #5 Công việc của tôi trên mobile (0.5) → #8 + #9 thứ tự khối & ghim Cần bạn (0.75) → #4 refetch khi quay lại (0.25). *≈ 1.75 ngày, hết "khó theo dõi" ở mức cơ bản.*
2. #3 trang Hôm nay (1) + #1/#2 sidebar ≤ 8 (1.5). *≈ 2.5 ngày.*
3. #20 realtime (1) + #21 cache `decisionsOn` (0.5) + #22 lazy chat (0.5). *≈ 2 ngày, hết "chậm".*
4. #10 tab Diễn biến hợp nhất (2) và #24/#4 từ vựng (0.5) ở đợt sau.
