# Kiểm tra sau khi đưa đợt T và S lên production

Chỉ đọc, không bước nào ghi dữ liệu. Làm theo thứ tự; dừng ở bước đầu tiên không đạt và gửi lại kết quả của bước đó.

## 0. Trước khi triển khai

- [ ] Có bản sao lưu `pg_dump` mới của database Studio, và đã thử `pg_restore -l <tệp>` ra danh sách bảng (không lỗi).
- [ ] Ghi lại commit đang chạy: `git rev-parse HEAD` ở thư mục triển khai (dùng để quay lại nếu cần).

## 1. Ứng dụng đã lên (5 phút đầu)

- [ ] Trang đăng nhập mở được, đăng nhập bằng tài khoản quản trị được.
- [ ] Nhật ký khởi động không có dòng migration thất bại. Tìm `error`, `migration`, `failed` quanh lúc khởi động.
- [ ] Trang **Hôm nay** và **Công việc** mở được, không có thông báo lỗi đỏ.

## 2. Chín migration đã chạy

Đợt T: `202611140001` đến `202611140006`. Đợt S: `202611150001` đến `202611150003`. Chạy trong `psql`, chỉ `SELECT`. Tên bảng có thể viết `snake_case` hoặc `camelCase` tuỳ cấu hình, nên các câu dưới tìm theo mẫu, không theo tên cứng.

Bảng mới:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND replace(lower(table_name), '_', '') IN (
    'dsreactionrules', 'dsreactionattempts', 'dsissuetiers',
    'dsroutines', 'dsroutineprojects', 'dstwoapproaches', 'dsquotathrottles')
ORDER BY 1;
```

Kết quả phải là đúng **7** bảng: `dsReactionRules`, `dsReactionAttempts`, `dsIssueTiers`, `dsRoutines`, `dsRoutineProjects`, `dsTwoApproaches`, `dsQuotaThrottles`.

Cột mới (đúng **6** dòng: 3 của `dsVerifications`, 2 của `dsAutopilotSettings`, 1 của `dsRoutines`):

```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (replace(lower(table_name), '_', '') = 'dsverifications'
       AND replace(lower(column_name), '_', '') IN ('contradictedat', 'contradictedby', 'source'))
    OR (replace(lower(table_name), '_', '') = 'dsautopilotsettings'
       AND replace(lower(column_name), '_', '') IN ('automergeongithub', 'verifyonci'))
    OR (replace(lower(table_name), '_', '') = 'dsroutines'
       AND replace(lower(column_name), '_', '') = 'job'))
ORDER BY 1, 2;
```

- [ ] Có đủ 7 bảng và 6 cột. Thiếu cái nào, ghi lại tên và dừng.

Dữ liệu cũ còn nguyên (đếm trước và sau phải bằng nhau, đã ghi ở bước 0 nếu bạn đếm):

```sql
SELECT count(*) FROM pm_issues;  -- hoặc tên tương ứng trong schema của bạn
```

## 3. Giao diện: các mục mới

Mở dự án `nocofen`, tab **Cài đặt → Chung**. Thứ tự từ trên xuống phải là:

- [ ] **Tự lái** (đã có từ trước)
- [ ] Hạng mặc định
- [ ] **Hàng rào nhánh chính** (T3a): hiện một trong ba trạng thái "bảo vệ đúng", "còn hở", hoặc "GitHub không cho Studio đọc". Không hiện nghĩa là bản chưa lên.
- [ ] Phản ứng tự động (T2, S1)
- [ ] Kiểm giao diện (S3)
- [ ] **Bộ quy tắc trong kho mã** (T4, S5)
- [ ] Cấu hình hiệu lực
- [ ] Tiêu chí mặc định (đã có từ trước)

Hai thứ phải **tắt**, vì chưa ai bật: công tắc "Cho GitHub merge khi check xanh (thử nghiệm)" và "kiểm chứng trên CI". Nếu thấy chúng đang bật khi chưa ai bật, dừng và báo.

Cài đặt hệ thống:

- [ ] **Cài đặt hệ thống → Nhật ký chạy** mở được và tìm theo khoảng ngày được (S6).
- [ ] Mục Routine có tuỳ chọn công việc "sao lưu" (S7). Chỉ nhìn, chưa tạo.
- [ ] Mục vai trò có nhóm quyền `studio.verify` với hành động `submit` (S4). Chỉ nhìn, chưa cấp cho ai.

## 4. API đọc (cần phiên đăng nhập hoặc khoá API của bạn)

Thay `<id>` bằng `396406005170176`. Chỉ lệnh `GET`. Dán đầu ra, không dán khoá.

```sh
BASE=https://studio.dsc.edu.vn/main/api
curl -s -H "x-api-key: $KEY" "$BASE/projects/<id>/branchProtection"   # T3a: có data.verdict hoặc status
curl -s -H "x-api-key: $KEY" "$BASE/projects/<id>/autopilot"          # autoMergeOnGithub phải là false hoặc null
curl -s -H "x-api-key: $KEY" "$BASE/projects/<id>/harnessExport"      # S5: repository, files, missing, builtins
```

- [ ] `branchProtection` trả 200. Đường dẫn chính xác xem ở `<APP_BASE_PATH>/api/swagger` nếu 404.
- [ ] `autopilot` trả `autoMergeOnGithub` là `false` hoặc `null`.
- [ ] `harnessExport` trả `repository: "covuaduongsinh/nocofen"` và số tệp lớn hơn 0.

Route `harnessExport` yêu cầu người đăng nhập có quyền quản lý dự án; khoá API có thể bị từ chối. Khi đó dùng giao diện ở bước 5.

## 5. Xuất harness cho `nocofen` (S5)

Chỉ làm khi bước 1 đến 4 đều đạt.

1. Ở mục **Bộ quy tắc trong kho mã**, đọc dòng trạng thái. Mong đợi: "Chưa xuất lần nào sang covuaduongsinh/nocofen. Sẽ ghi N tệp."
2. Ghi lại khung "Dự án chưa có đủ kỹ năng dựng sẵn" nếu có, cùng tên skill thiếu.
3. Bấm **Xuất vào kho**. Thông báo: "Đã mở pull request #N".
4. Xem PR trên GitHub:
   - [ ] Tệp nằm dưới `.nb-studio/harness/` và `.agents/rules/ds-harness.md`, thêm một dòng vào Index của `AGENTS.md`.
   - [ ] Không có tệp nào dưới `.agents/skills/`.
   - [ ] Có skill toàn cục trong gói xuất.
   - [ ] Không có chuỗi nào trông như khoá hay mật khẩu. Nếu Studio từ chối và báo `SECRETS_FOUND`, đó là hành vi đúng: gửi số tệp và tên tệp, không gửi nội dung.
5. Nhập ngược bài học: thêm một dòng bài học mới (khác hash) vào `.nb-studio/harness/lessons.md` trên một nhánh, mở PR và merge. Mở thư viện bài học của dự án: bài đó phải xuất hiện.

## 6. Khi có dấu hiệu hỏng

- Migration lỗi giữa chừng: dừng ứng dụng, khôi phục từ bản `pg_dump` ở bước 0, quay lại commit đã ghi. Không sửa tay migration đã chạy.
- Mục giao diện không hiện nhưng bước 2 đạt: bản giao diện (client) chưa được build mới. Build và triển khai lại.
- Giữ nguyên mọi công tắc đang tắt (`autoMergeOnGithub`, `verifyOnCi`) cho đến khi bạn đã thử auto-merge với token GitHub App trên một dự án thật.

Gửi lại cho tôi: kết quả bước 2 (số bảng, số cột), ảnh mục "Hàng rào nhánh chính" và "Bộ quy tắc trong kho mã", số PR xuất, danh sách tệp trong PR đó. Tôi so với mong đợi và ghi vào §74.
