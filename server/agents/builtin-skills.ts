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

Trên runner dùng chung, theo giới hạn trong skill \`ds-app-rules\`. Commit và push lên nhánh của công việc, không viết lại lịch sử (riêng việc khởi tạo dự án được commit mốc gốc lên nhánh mặc định). Trả lời một lần: đã đổi gì, đã kiểm chứng thế nào, còn gì chưa làm.
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
    'ds-app-rules',
    'project',
    'Luật cho ứng dụng NocoBase 3 của Dương Sinh: nguồn gốc, quyền, dữ liệu, giấy phép, giới hạn runner. Dùng mỗi khi sửa một repo NocoBase 3.',
    `
# Luật ứng dụng NocoBase 3

Chỉ áp dụng cho repo NocoBase 3. Repo khác (NocoBase 2, sandbox) thì bỏ qua.

## Nguồn gốc

Chỉ xây trên mẫu tạo bằng \`create-app\`. Không sao chép mã từ NocoCRM hay app khác. Không đổi phiên bản \`@nocobase/*\`; nâng cấp chỉ qua skill \`nocobase-app-upgrade\`.

## Quyền

Mọi route có \`auth.required()\` và kiểm quyền; mọi trang có \`authz\`. Gán vai trò cho người cụ thể, không gán cho mọi người.

## Dữ liệu

Không commit dữ liệu thật, mật khẩu, \`.env\`, \`config.yml\`, \`.sqlite\`, file dump. Bí mật lấy từ biến môi trường hoặc Dokploy. Dữ liệu học viên là trẻ em: tối thiểu hoá, không đưa vào seed, test hay log. Chạy được trên SQLite và Postgres: boolean ghi \`true\`/\`false\`, không dùng hàm SQL riêng của một loại DB.

## Giấy phép

Thư viện do ứng dụng thêm chỉ dùng MIT, BSD, Apache, ISC hoặc CC0. Cấm \`chessground\`, \`chessops\`, \`@lichess-org/pgn-viewer\`, \`tournament-pairings\`, \`stockfish\` chạy trong trình duyệt. Bàn cờ dùng \`react-chessboard\` hoặc \`cm-chessboard\`; luật cờ dùng \`chess.js\`.

## Giao diện

Tiếng Việt (vi-VN); navy \`#2B3990\`, gold \`#F5A623\`, font Roboto. Tài liệu nằm trong \`docs/\` của repo.

## Giới hạn runner

Runner dùng chung chỉ có 2,5 GiB RAM. Cấm \`pnpm check\`, \`pnpm lint\`, \`pnpm test\`, \`pnpm build\`, \`pnpm typecheck\`, \`tsc\` toàn repo, \`vitest run\` không chỉ rõ file, và để \`pnpm dev\` chạy lâu. Mỗi lúc một lệnh, theo file: \`pnpm exec vitest run <file>\`, \`pnpm exec eslint <file>\`, \`pnpm exec prettier --check <file>\`. Commit và push sau từng bước nhỏ.

## Trước khi bàn giao, dán output

- Có CI: kết quả CI của PR. Không có CI: ghi rõ \`pnpm check\` chưa chạy, chủ dự án chạy trên máy dev.
- \`grep -E "^\\s+'?(chessground|chessops|@lichess-org/pgn-viewer|tournament-pairings|stockfish)@" pnpm-lock.yaml\` phải rỗng.
- \`pnpm licenses list\` (không có \`--prod\`, vì thư viện client nằm ở devDependencies): báo mọi GPL/AGPL không có lựa chọn \`OR\`.
- \`git ls-files | grep -iE "\\.sqlite|\\.env$|config\\.yml$|\\.dump"\` phải rỗng; file cấu hình triển khai không có bí mật thì nêu tên và lý do.
- Test route chưa đăng nhập trả 401, chạy theo từng file.
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
