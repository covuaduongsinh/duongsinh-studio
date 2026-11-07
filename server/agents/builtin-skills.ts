/**
 * The skills Studio's agents start with, written for this team in the structure of the demo's five. They are created
 * once, when missing; from then on they are the team's to edit in the skill library.
 */
export interface BuiltinSkill {
  readonly slug: string;
  /** `global` reaches every run; `project` is attached to projects created from now on. */
  readonly reach: 'global' | 'project';
  readonly content: string;
}

const skill = (
  slug: string,
  reach: BuiltinSkill['reach'],
  description: string,
  body: string,
): BuiltinSkill => ({
  slug,
  reach,
  content: `---\nname: ${slug}\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trim()}\n`,
});

export const BUILTIN_SKILLS: readonly BuiltinSkill[] = [
  skill(
    'ds-workflow',
    'project',
    'Cách một công việc đi từ lúc nhận đến lúc bàn giao ở Dương Sinh Studio. Dùng khi điều phối hoặc bắt đầu một công việc.',
    `
# Quy trình làm việc

## Ai làm gì

- Trưởng nhóm agent điều phối: chọn agent, giao từng bước, không tự sửa code.
- Agent thực thi làm đúng một bước được giao rồi trả lời một lần trong luồng đó.
- Chủ công việc quyết định và nghiệm thu.

## Cần approach trước hay không

Viết approach trước khi sửa nếu công việc đụng dữ liệu, migration, quyền, xử lý đồng thời, hoặc mô tả không nói rõ cách làm. Các việc còn lại làm luôn.

## Các bước

1. Đọc mô tả, bình luận gần nhất và ghi nhớ dự án.
2. Mỗi lần chỉ một bước đổi code. Chỉ sang bước sau khi lượt chạy trước đã kết thúc.
3. Review bởi agent khác, không yếu hơn tác giả.
4. Check đỏ thì đọc log trước khi sửa.

## Sẵn sàng bàn giao

Khi review đạt và check xanh: chuyển sang chờ nghiệm thu, ghi rõ việc người cần làm và báo cáo bàn giao. Mọi quyết định của người đều đi qua trạng thái bị vướng kèm một câu hỏi.
`,
  ),
  skill(
    'ds-development',
    'project',
    'Cách làm một bước đổi code: thiết kế, kiểm chứng, xử lý CI, nhận review và bàn giao. Dùng khi được giao sửa code.',
    `
# Làm một bước phát triển

## Làm một bước

Chỉ làm đúng bước được giao. Thấy việc khác cần làm thì nêu trong phần trả lời, không tự mở rộng.

## Thiết kế

Theo cách repo đang làm; đọc tài liệu và file quy tắc của repo trước. Ưu tiên cơ chế sẵn có hơn tự viết.

## Chi phí đường nóng

Với đoạn chạy thường xuyên, tránh truy vấn lặp theo từng dòng và tránh tải dữ liệu không dùng.

## Kiểm chứng

Thêm test cho đúng hành vi vừa đổi. Chạy kiểm tra trong phạm vi file bị ảnh hưởng và báo kết quả thật; không báo xong khi còn test đỏ, test bị bỏ qua hay chưa chạy thử.

## CI lỗi

Đọc log của check, tìm nguyên nhân, sửa nguyên nhân. Không tắt check để cho xanh.

## Review

Sửa mọi mục must fix. Mục nào không đồng ý thì trả lời kèm lý do trong luồng.

## Bàn giao

Commit và push lên nhánh của công việc, không viết lại lịch sử. Trả lời một lần: đã đổi gì, đã kiểm chứng thế nào, còn gì chưa làm.
`,
  ),
  skill(
    'ds-approach',
    'project',
    'Khuôn viết approach trước khi sửa code. Dùng khi được yêu cầu đề xuất cách làm, không sửa code ở bước này.',
    `
# Viết approach

Không sửa code ở bước này. Viết ngắn, theo đúng năm mục:

- **Khuyến nghị:** làm cách nào, trong một đến hai câu.
- **Thay đổi:** các file, bảng, route, trang sẽ đổi.
- **Chi phí:** công sức và rủi ro, gồm cả dữ liệu cũ và tương thích ngược.
- **Cần xác nhận:** điều chỉ người mới quyết được; nếu không có thì ghi "Không".
- **Để ngoài:** những gì cố ý không làm lần này.
`,
  ),
  skill(
    'ds-review',
    'project',
    'Cách review một pull request và viết kết luận. Dùng khi được giao review ở chế độ chỉ đọc.',
    `
# Review pull request

Đọc diff, đối chiếu với mô tả công việc và chạy test liên quan nếu được. Không sửa code.

## Bốn mức

- **Must fix:** sai hành vi, lỗi bảo mật, mất dữ liệu, thiếu test cho thay đổi quan trọng.
- **Should fix:** nên sửa nhưng không chặn merge.
- **Note:** ghi nhận, không cần hành động.
- **Pre-existing:** lỗi có từ trước, không do thay đổi này.

## Kết luận

Mỗi mục nêu file, dòng và hậu quả cụ thể. Nộp phiếu review có cấu trúc, rồi kết thúc bằng đúng một trong hai câu: "Có thể merge" hoặc "Chưa thể merge".
`,
  ),
  skill(
    'ds-comment-style',
    'global',
    'Cách viết bình luận trên công việc. Dùng mỗi khi viết bình luận hoặc tóm tắt lượt chạy.',
    `
# Cách viết bình luận

- Kết luận trước, lý do sau.
- Tối đa năm gạch đầu dòng.
- Nếu cần hỏi, chỉ hỏi một câu và nêu khuyến nghị của bạn.
- Chi tiết để cuối, tối đa ba liên kết.
- Viết tiếng Việt; giữ nguyên lệnh, đường dẫn và định danh.
`,
  ),
];
