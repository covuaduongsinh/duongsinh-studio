# Kế hoạch đợt S — Hoàn thiện sau đợt T

Ngày 14/11/2026 (đêm) · Người soạn: Claude, theo yêu cầu của Thầy Tường
Kiểm trên `main` = `51bf763` (PR tới #140; đợt T là #121–#138).

## 0. Kết luận

**Đợt T đạt về mã, chưa đạt về vận hành thật.** 13 bước đều đã merge, có test, có tài liệu chỗ lệch
(`docs/chenh-lech-upstream.md` §59–§69) viết trung thực. Nhưng có **4 lỗi hành vi nên sửa trước khi bật trên dự án
thật**, và gần như chưa bước nào được thử với GitHub thật, Actions thật hay VPS thật.

Kết quả kiểm tự động trên bản `51bf763` (chạy lại độc lập, không dựa vào báo cáo của phiên triển khai):

| Kiểm tra | Phạm vi | Kết quả |
| --- | --- | --- |
| `pnpm typecheck` | toàn repo (3 tsconfig) | đạt |
| `eslint --max-warnings 0` | mọi file `.ts/.tsx/.mjs` đợt T đổi | đạt |
| `pnpm format:check` | toàn repo | đạt |
| `pnpm check:packages` | toàn repo | đạt |
| `vitest` 52 file test đợt T thêm/sửa | 186 test | 184 đạt, 2 bỏ qua có chủ ý (test `audit.sh` khi chạy bằng root) |
| An toàn gán quyền, `agents-md`, tên quyền trang, khớp 3 ngôn ngữ | 5 file, 22 test | đạt |
| `vitest` toàn bộ | 295 file, 1.265 test | 1.263 đạt, 2 bỏ qua có chủ ý, 0 hỏng |

Chưa kiểm được từ đây: CI trên GitHub của `main`, production (`studio.dsc.edu.vn`), GitHub App thật, Actions thật, VPS.

## 1. Bốn lỗi hành vi (sửa trước)

### S1 — Phản ứng tự động bỏ sót đúng lúc cần nhất, và phạt nhầm bình luận của người

Mã: `server/reactions/service.ts`, `server/providers/reactions.ts`, `server/reactions/review-comments.ts`.

1. **Việc đang ở "Chờ nghiệm thu" thì mọi phản ứng bị bỏ qua** (`issue.statusKey !== 'in_progress'` → `skipped`). Đó
   lại là lúc Thầy mở PR để xem và bình luận theo dòng, và là lúc PR hay bị xung đột vì việc khác vừa merge. Kết quả:
   bình luận theo dòng của Thầy không đánh thức ai; PR xung đột nằm im.
2. **Bình luận của người bị đếm như "lượt tự sửa thất bại".** Khoá chống lặp của `prLineComment` là `headSha`, trần 2.
   Trên app GitHub, mỗi bình luận đơn là một phiếu review riêng, nên bình luận thứ ba của Thầy trên cùng một commit sẽ
   đẩy việc sang **Đang vướng** với lời "tự sửa chưa xong".
3. **Sự kiện bị bỏ qua thì mất hẳn.** `ciFailed`/`conflicts` chỉ phát khi trạng thái *chuyển*; nếu lúc đó bị bỏ qua (sai
   trạng thái, hết ngân sách, agent bận, giới hạn) thì không ghi vết, không thử lại, không báo ai. Việc lại rơi về chờ
   báo "đứng" 30 phút như trước đợt T.
4. **Trần 5 lượt là theo từng loại sự kiện**, không phải tổng của việc như đã chốt ở Q1: một việc có thể tốn tới 5 lượt
   cho mỗi loại (tổng trên 20 lượt).
5. **Leo thang chỉ báo một lần cho mỗi cặp (việc, sự kiện)** (`idempotencyKey` không có lần), và chỉ vào Hộp thư, chưa
   có thông báo đẩy ra điện thoại.
6. Phiếu review loại "chỉ bình luận" mà không có nội dung (ví dụ trả lời một luồng) vẫn đánh thức agent.

Sửa:

- Cho phản ứng chạy khi việc ở `in_progress` **hoặc** `in_review`; khi phản ứng ở `in_review` thì đưa việc về
  `in_progress` và xoá `needsYou` qua API của plugin projects (không ghi thẳng bảng), để tự lái không merge giữa chừng.
- `prLineComment`: khoá chống lặp là **id phiếu review**; không tính vào trần tự sửa; không bao giờ leo thang. Gom các
  phiếu của cùng người trong 90 giây thành một lần đánh thức. Bỏ qua phiếu không có chữ nào.
- Sự kiện bị bỏ qua: ghi `ds_autopilot_events` (`kind = 'reactionSkipped'`, kèm lý do) và hiện trên trang việc. Với lý
  do tạm thời (`limited`, `unavailable`, `waitingOwner`) thử lại một lần ở nhịp quét của tự lái nếu PR vẫn đỏ/xung đột
  trên cùng `headSha`.
- Trần của việc tính trên **tổng** các sự kiện tự động (`ciFailed`, `conflicts`, `reviewChanges`, `runFailed`).
- Leo thang: `idempotencyKey` thêm số lần leo thang; gửi thêm kênh web push đã cài.

Xong khi: test cho từng điểm 1–6; kịch bản "ba bình luận đơn liên tiếp trên một commit" không làm việc sang Đang vướng.

### S2 — Tự merge của GitHub (T3b) nhiều khả năng không bao giờ bật được, và không có đường tắt

Mã: `server/autopilot/evaluator.ts` (`mergeIfEligible`), `server/git/service.ts` (`enableAutoMerge`),
`server/git/github.ts`.

- `enableAutoMerge` chỉ được gọi **sau khi** bộ đánh giá đã đạt, tức PR đã `clean` và CI đã xanh. Theo hiểu biết của
  tôi, GitHub từ chối bật auto-merge cho PR đã sẵn sàng merge. Nếu đúng, dự án bật tuỳ chọn này sẽ **không merge được
  PR nào**. Phiên triển khai cũng ghi "chưa thử với GitHub thật", nên đây là điều phải thử, không phải điều đã biết chắc.
- Không có `disablePullRequestAutoMerge`: nếu auto-merge đã bật mà agent đẩy thêm commit chưa review, GitHub vẫn merge
  khi check xanh.

Sửa:

- PR đã `clean` → merge trực tiếp như cũ. Chỉ khi thứ duy nhất còn thiếu là check đang chạy → bật auto-merge.
- Tắt auto-merge khi PR có `headSha` mới, khi có bình luận của người sau review, hoặc khi bộ đánh giá không còn đạt.
- Thử trên một kho nháp thật, ghi kết quả vào `chenh-lech-upstream.md` §62. Trong lúc chưa thử: ghi rõ ở giao diện
  "thử nghiệm", và **Thầy chưa bật tuỳ chọn này**.

### S3 — Kiểm giao diện (T5) hiện chỉ chụp được trang đăng nhập

Mã: `server/setups/ui-smoke-workflow.ts`.

- Script mở trang khi **chưa đăng nhập**, nên mọi trang nghiệp vụ đều chuyển về trang đăng nhập; ảnh không cho thấy
  giao diện vừa sửa.
- Các bước dựng và khởi động (`config init` trong `dist`, cổng, đường dẫn `/main`, migration) chưa chạy lần nào trên
  Actions.
- Ảnh mới chỉ là artifact của lượt chạy; chưa hiện ở thẻ "Thay đổi" (T7).

Sửa:

- Thêm bước tạo một tài khoản thử bằng lệnh CLI của ứng dụng (đọc skill `nocobase-app-plugin-users` và
  `nocobase-deployment` trước), script đăng nhập rồi mới mở trang. Mật khẩu sinh ngẫu nhiên trong job, không dùng secret.
- Chạy thật trên một kho nháp tạo từ template beta.89, sửa tới khi xanh, rồi mới coi là xong.
- Studio đọc danh sách artifact của lượt `ds-ui-smoke` trên `headSha` và hiện ảnh trong thẻ "Thay đổi" (liên kết tới
  artifact nếu không nhúng được ảnh).

### S4 — Kiểm chứng (T2) đã chặt hơn nhưng agent vẫn là bên khai `exitCode`

Mã: `server/routes/verifications.ts`, `server/routes/verification-plan.ts`.

Điều đã tốt: không nhận `result` tự khai, bắt buộc `exitCode`, từ chối `headSha` cũ, CI đỏ thì `contradicted`, và đã
sửa một lỗi có sẵn (tiêu chí `ci` so nhầm `success` với `passed` nên ngoài test luôn đỏ).

Điều còn hở: câu lệnh do Studio cấp nhưng agent tự chạy và tự gửi `exitCode`. H1e mới **hẹp lại**, chưa đóng.

Sửa (chọn một, hỏi Thầy ở Q1):

- **Cách A (đề nghị):** thêm job `ds-verify` vào mẫu `ds-check`: job gọi `verify plan` bằng khoá CI của dự án, tự chạy
  các lệnh, tự nộp. Bản nộp từ khoá CI được ghi `source = ci`; cổng merge chỉ tin `source = ci` cho tiêu chí
  `test`/`command` khi dự án bật "kiểm chứng trên CI". Bản agent nộp vẫn dùng để agent tự soát trước.
- **Cách B:** giữ nguyên, chấp nhận CI là trọng tài, và ghi rõ giới hạn này ở trang Kiểm chứng.

## 2. Việc hoàn thiện mức vừa

| # | Việc | Vì sao | Công |
| --- | --- | --- | --- |
| S5 | T4: xuất thử vào NocoFEN; gói xuất chỉ lấy skill **gắn theo dự án**, nên thêm skill toàn cục (`ds-comment-style`) và báo vàng khi dự án cũ chưa được gắn đủ bộ `ds-*`; làm nhập ngược bài học ở trạng thái chờ duyệt | Bộ `ds-*` chỉ tự gắn cho dự án tạo sau này; dự án cũ có thể xuất ra gói thiếu. Nhập ngược là nửa còn lại của T4 | 1 ngày |
| S6 | T11: ô tìm nhật ký trong Cài đặt hệ thống; chỉ mục hoặc giới hạn thời gian cho truy vấn `LIKE` trên `ag_run_events`; sửa câu báo lỗi chép nhầm ("Branch protection is read by people…") | API có nhưng chưa có chỗ bấm; quét toàn bảng sẽ chậm dần | 0,5 ngày |
| S7 | T6: mẫu "Thử khôi phục sao lưu" chuyển sang chạy qua kênh job của daemon, không giao cho agent | Sau T8 runner không đọc được thư mục sao lưu, nên agent không làm nổi việc này | 0,5 ngày |
| S8 | T8: `audit.sh` thêm kiểm mạng (thử nối tới cổng Dokploy, Postgres, Docker TCP qua loopback và IP công khai); ghi chú rằng các chỉ thị sandbox trong unit của user có thể làm runner không khởi động | `IPAddressDeny` dải riêng không chặn loopback và IP công khai của chính VPS; unit `--user` không phải lúc nào cũng dùng được `ProtectSystem` | 0,5 ngày |
| S9 | Nhật ký đợt T (`docs/plans/2026-11-15-nhat-ky-dot-t.md`): gom chỗ lệch, việc chưa thử, số đo | Các đợt trước đều có; giúp phiên sau không đọc lại 13 PR | 0,25 ngày |
| S10 | Thẻ "Hạn mức" (T13): trạng thái giảm tải đang nằm trong bộ nhớ tiến trình, mất khi khởi động lại; lưu vào bảng | Sau mỗi lần deploy thẻ báo sai là "ổn" | 0,5 ngày |

## 3. Việc chỉ Thầy làm được (theo thứ tự nên làm)

1. **Sao lưu rồi mới đưa đợt T lên production.** Đợt T có 6 migration (`202611140001`–`0006`). Chạy `pg_dump` Studio
   trước, tạm dừng tự lái, rồi phát hành.
2. **Tick hai sự kiện ở mỗi GitHub App**: *Pull request review* và *Pull request review comment*. Chưa tick thì bình
   luận theo dòng không tới Studio.
3. **Bật bảo vệ nhánh chính** theo 4 bước ở mục "Hàng rào nhánh chính" của từng dự án; **không** bật "bắt buộc có người
   duyệt" (App của Studio không tự duyệt được). Bấm "Kiểm lại" và báo kết quả: phần đọc này chưa từng chạy với GitHub
   thật.
4. **Chưa bật** "tự merge của GitHub" cho tới khi S2 xong.
5. **Chạy `ds-studio bench run` (bộ `ds-core`)** trên máy dev để có điểm chuẩn; chạy ba truy vấn chỉ đọc ở mục 3 của kế
   hoạch T trên CSDL production. Hiện cả bốn số nền vẫn là "chưa đo được", nên chưa nói được đợt T nhanh hơn bao nhiêu.
6. **Thử `deploy/runner/` trên VPS với một lượt chạy**, sẵn sàng gỡ file nếu runner không khởi động; rồi chạy `audit.sh`.
7. Còn treo từ đợt V: cài daemon job, rclone sao lưu ra ngoài VPS, token đọc Releases, thử một tag phát hành.

## 4. Thứ tự và công sức

| Thứ tự | Bước | Công (ngày agent) |
| --- | --- | --- |
| 1 | S1 phản ứng | 1,5 |
| 2 | S2 auto-merge (cần một kho nháp thật) | 1 |
| 3 | S3 kiểm giao diện (cần một kho nháp thật) | 1,5 |
| 4 | S4 kiểm chứng trên CI (nếu Thầy chọn cách A) | 1,5 |
| 5 | S5 → S10 | 3,25 |

Tổng khoảng 8–9 ngày agent; riêng S1–S3 khoảng 4 ngày.

## 5. Kết quả chạy toàn bộ test

Chạy `vitest run` trên toàn repo ở bản `51bf763` (khoảng 30 phút trên máy kiểm): **295 file đạt, 1.263 test đạt, 2 bỏ
qua, 0 hỏng**. Hai test bỏ qua là của `tests/project/runner-audit.test.ts`, tự bỏ khi chạy bằng root. Như vậy đợt T không
làm hỏng test nào của các đợt trước; các lỗi ở mục 1 là lỗi thiết kế hành vi mà test hiện có không bao tới.

## 6. Câu hỏi cần Thầy chốt

| # | Câu hỏi | Mặc định |
| --- | --- | --- |
| Q1 | S4 làm cách A (kiểm chứng chạy lại trên Actions bằng khoá CI) hay cách B (giữ nguyên)? | A, bật theo từng dự án, mặc định tắt |
| Q2 | Có một kho nháp trên GitHub để thử S2 và S3 không (tạo từ template beta.89, private)? | Thầy tạo `covuaduongsinh/ds-sandbox` và nối vào Studio máy dev |
| Q3 | Bình luận theo dòng khi việc đang "Chờ nghiệm thu": tự đưa việc về "Đang làm"? | Có |
| Q4 | Leo thang gửi thông báo đẩy ra điện thoại? | Có |

## 7. Không làm

- Không viết lại phần nào của đợt T đang đúng.
- Không bật thay Thầy bất kỳ tuỳ chọn nào trên production, không SSH, không đổi GitHub App.
- Chưa làm T3c (review trên Actions) và T7b (góp ý trên bản xem thử): vẫn chờ Thầy bảo.
