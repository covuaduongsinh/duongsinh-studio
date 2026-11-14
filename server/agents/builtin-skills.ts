import { createHash } from 'node:crypto';

/**
 * The skills Studio's agents start with, written for this team in the structure of the demo's five. They are created
 * when missing and automatically upgraded to newer revisions when unmodified. When customized by hand, Studio keeps
 * the team's version and alerts administrators in the inbox.
 */
export interface BuiltinSkill {
  readonly slug: string;
  /** `global` reaches every run; `project` is attached to projects created from now on. */
  readonly reach: 'global' | 'project';
  /** The published revision of this builtin skill, starting from 1. Must be bumped on every content change. */
  readonly revision: number;
  readonly content: string;
  /**
   * Earlier published contents (or their hashes) for this skill, so Studio knows whether the current version in
   * the library came from an older builtin revision rather than being edited by hand.
   */
  readonly history?: readonly string[];
}

export function normalizeSkillContent(content: string): string {
  return content.replace(/\r\n/gu, '\n').trim();
}

export function skillContentHash(content: string): string {
  return createHash('sha256')
    .update(normalizeSkillContent(content))
    .digest('hex');
}

/**
 * Checks whether `content` matches either the current builtin content or one of its previously published revisions.
 */
export function isBuiltinPublishedContent(
  builtin: BuiltinSkill,
  content: string,
): boolean {
  const hash = skillContentHash(content);
  if (hash === skillContentHash(builtin.content)) return true;
  if (!builtin.history || builtin.history.length === 0) return false;
  return builtin.history.some(
    (past) => hash === skillContentHash(past) || hash === past,
  );
}

const skill = (
  slug: string,
  reach: BuiltinSkill['reach'],
  revision: number,
  description: string,
  body: string,
  history?: readonly string[],
): BuiltinSkill => ({
  slug,
  reach,
  revision,
  content: `---\nname: ${slug}\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trim()}\n`,
  ...(history && history.length > 0 ? { history } : {}),
});

export const BUILTIN_SKILLS: readonly BuiltinSkill[] = [
  skill(
    'ds-workflow',
    'project',
    5,
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
3. Review bởi agent khác, không yếu hơn tác giả: đối chiếu từng tiêu chí nghiệm thu và kết quả kiểm chứng. Nếu có tiêu chí chưa đạt thì không được duyệt (approve).
4. Check đỏ thì đọc log trước khi sửa.

## Studio tự phản ứng

Khi CI đỏ, nhánh xung đột, review xin sửa hoặc lượt chạy lỗi, Studio tự đánh thức người đang giữ việc, tối đa 2 lần cho mỗi lần đẩy và 5 lần cho mỗi việc. Việc chỉ sang trạng thái bị vướng khi đã hết lượt đó; lúc ấy mới cần điều phối viên hay người xem lại. Đừng giao lại việc mà Studio vừa đánh thức.

## Sẵn sàng bàn giao

Khi review đạt, check xanh, và lượt Kiểm chứng mới nhất của đúng commit đầu PR đạt (passed, không bị CI phủ định thành contradicted; xem skill \`ds-development\`): chuyển sang chờ nghiệm thu (in_review), ghi rõ việc người cần làm và báo cáo bàn giao. Mọi quyết định của người đều đi qua trạng thái bị vướng kèm một câu hỏi.
`,
    [
      '---\nname: ds-workflow\ndescription: "Cách một công việc đi từ lúc nhận đến lúc bàn giao ở Dương Sinh Studio. Dùng khi điều phối hoặc bắt đầu một công việc."\n---\n\n# Quy trình làm việc\n\n## Ai làm gì\n\n- Trưởng nhóm agent điều phối: chọn agent, giao từng bước, không tự sửa code.\n- Agent thực thi làm đúng một bước được giao rồi trả lời một lần trong luồng đó.\n- Chủ công việc quyết định và nghiệm thu.\n\n## Cần approach trước hay không\n\nViết approach trước khi sửa nếu công việc đụng dữ liệu, migration, quyền, xử lý đồng thời, hoặc mô tả không nói rõ cách làm. Các việc còn lại làm luôn.\n\n## Các bước\n\n1. Đọc mô tả, bình luận gần nhất và ghi nhớ dự án.\n2. Mỗi lần chỉ một bước đổi code. Chỉ sang bước sau khi lượt chạy trước đã kết thúc.\n3. Review bởi agent khác, không yếu hơn tác giả: đối chiếu từng tiêu chí nghiệm thu và kết quả kiểm chứng. Nếu có tiêu chí chưa đạt thì không được duyệt (approve).\n4. Check đỏ thì đọc log trước khi sửa.\n\n## Sẵn sàng bàn giao\n\nKhi review đạt, check xanh, và lượt Kiểm chứng mới nhất của đúng commit đầu PR đạt (passed, không bị CI phủ định thành contradicted; xem skill `ds-development`): chuyển sang chờ nghiệm thu (in_review), ghi rõ việc người cần làm và báo cáo bàn giao. Mọi quyết định của người đều đi qua trạng thái bị vướng kèm một câu hỏi.\n',
      `---\nname: ds-workflow\ndescription: "Cách một công việc đi từ lúc nhận đến lúc bàn giao ở Dương Sinh Studio. Dùng khi điều phối hoặc bắt đầu một công việc."\n---\n\n# Quy trình làm việc\n\n## Ai làm gì\n\n- Trưởng nhóm agent điều phối: chọn agent, giao từng bước, không tự sửa code.\n- Agent thực thi làm đúng một bước được giao rồi trả lời một lần trong luồng đó.\n- Chủ công việc quyết định và nghiệm thu.\n\n## Cần approach trước hay không\n\nViết approach trước khi sửa nếu công việc đụng dữ liệu, migration, quyền, xử lý đồng thời, hoặc mô tả không nói rõ cách làm. Các việc còn lại làm luôn.\n\n## Các bước\n\n1. Đọc mô tả, bình luận gần nhất và ghi nhớ dự án.\n2. Mỗi lần chỉ một bước đổi code. Chỉ sang bước sau khi lượt chạy trước đã kết thúc.\n3. Review bởi agent khác, không yếu hơn tác giả.\n4. Check đỏ thì đọc log trước khi sửa.\n\n## Sẵn sàng bàn giao\n\nKhi review đạt và check xanh: chuyển sang chờ nghiệm thu, ghi rõ việc người cần làm và báo cáo bàn giao. Mọi quyết định của người đều đi qua trạng thái bị vướng kèm một câu hỏi.\n`,
      `---\nname: ds-workflow\ndescription: "Cách một công việc đi từ lúc nhận đến lúc bàn giao ở Dương Sinh Studio. Dùng khi điều phối hoặc bắt đầu một công việc."\n---\n\n# Quy trình làm việc\n\n## Ai làm gì\n\n- Trưởng nhóm agent điều phối: chọn agent, giao từng bước, không tự sửa code.\n- Agent thực thi làm đúng một bước được giao rồi trả lời một lần trong luồng đó.\n- Chủ công việc quyết định và nghiệm thu.\n\n## Cần approach trước hay không\n\nViết approach trước khi sửa nếu công việc đụng dữ liệu, migration, quyền, xử lý đồng thời, hoặc mô tả không nói rõ cách làm. Các việc còn lại làm luôn.\n\n## Các bước\n\n1. Đọc mô tả, bình luận gần nhất và ghi nhớ dự án.\n2. Mỗi lần chỉ một bước đổi code. Chỉ sang bước sau khi lượt chạy trước đã kết thúc.\n3. Review bởi agent khác, không yếu hơn tác giả.\n4. Check đỏ thì đọc log trước khi sửa.\n\n## Sẵn sàng bàn giao\n\nKhi review đạt, check xanh, và đã nộp lượt Kiểm chứng đạt (passed) qua \`ds-studio verify submit\`: chuyển sang chờ nghiệm thu (in_review), ghi rõ việc người cần làm và báo cáo bàn giao. Mọi quyết định của người đều đi qua trạng thái bị vướng kèm một câu hỏi.\n`,
      '---\nname: ds-workflow\ndescription: "Cách một công việc đi từ lúc nhận đến lúc bàn giao ở Dương Sinh Studio. Dùng khi điều phối hoặc bắt đầu một công việc."\n---\n\n# Quy trình làm việc\n\n## Ai làm gì\n\n- Trưởng nhóm agent điều phối: chọn agent, giao từng bước, không tự sửa code.\n- Agent thực thi làm đúng một bước được giao rồi trả lời một lần trong luồng đó.\n- Chủ công việc quyết định và nghiệm thu.\n\n## Cần approach trước hay không\n\nViết approach trước khi sửa nếu công việc đụng dữ liệu, migration, quyền, xử lý đồng thời, hoặc mô tả không nói rõ cách làm. Các việc còn lại làm luôn.\n\n## Các bước\n\n1. Đọc mô tả, bình luận gần nhất và ghi nhớ dự án.\n2. Mỗi lần chỉ một bước đổi code. Chỉ sang bước sau khi lượt chạy trước đã kết thúc.\n3. Review bởi agent khác, không yếu hơn tác giả: đối chiếu từng tiêu chí nghiệm thu và kết quả kiểm chứng. Nếu có tiêu chí chưa đạt thì không được duyệt (approve).\n4. Check đỏ thì đọc log trước khi sửa.\n\n## Sẵn sàng bàn giao\n\nKhi review đạt, check xanh, và đã nộp lượt Kiểm chứng đạt (passed) qua `ds-studio verify submit`: chuyển sang chờ nghiệm thu (in_review), ghi rõ việc người cần làm và báo cáo bàn giao. Mọi quyết định của người đều đi qua trạng thái bị vướng kèm một câu hỏi.\n',
    ],
  ),
  skill(
    'ds-development',
    'project',
    3,
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

Thêm test cho đúng hành vi vừa đổi. Chạy kiểm tra trong phạm vi file bị ảnh hưởng và báo kết quả thật; không báo xong khi còn test đỏ, test bị bỏ qua hay chưa chạy thử. Kiểm chứng không do bạn tự báo: chạy \`ds-studio verify plan <IDENTIFIER>\` để lấy đúng câu lệnh của từng tiêu chí và commit cần kiểm (đầu PR đang mở); tự chạy từng câu lệnh ở đúng commit đó, giữ mã thoát (exit code) và phần cuối của output; rồi nộp bằng \`ds-studio verify submit\` với \`exitCode\` và \`output\` thật của từng câu lệnh. Studio suy kết quả từ exitCode, bỏ qua mọi \`result\` bạn tự ghi, từ chối bản nộp thiếu exitCode hoặc sai commit, và nếu CI đỏ trên cùng commit thì lượt Kiểm chứng đạt bị đổi thành contradicted (không chuyển được sang in_review; sửa rồi kiểm chứng lại). Đối chiếu với toàn bộ tiêu chí nghiệm thu của việc; chỉ chuyển sang in_review khi kết quả Kiểm chứng đạt (passed). Nếu thất bại liên tiếp đến ngưỡng giới hạn (mặc định 2 lần), việc sẽ tự động chuyển sang Đang vướng (Blocked).

## CI lỗi

Đọc log của check, tìm nguyên nhân, sửa nguyên nhân. Không tắt check để cho xanh.

## Review

Sửa mọi mục must fix. Mục nào không đồng ý thì trả lời kèm lý do trong luồng.

## Bàn giao

Trên runner dùng chung, theo giới hạn trong skill \`ds-app-rules\`. Commit và push lên nhánh của công việc, không viết lại lịch sử (riêng việc khởi tạo dự án được commit mốc gốc lên nhánh mặc định). Trả lời một lần: đã đổi gì, đã kiểm chứng thế nào, còn gì chưa làm.
`,
    [
      `---\nname: ds-development\ndescription: "Cách làm một bước đổi code: thiết kế, kiểm chứng, xử lý CI, nhận review và bàn giao. Dùng khi được giao sửa code."\n---\n\n# Làm một bước phát triển\n\n## Làm một bước\n\nChỉ làm đúng bước được giao. Thấy việc khác cần làm thì nêu trong phần trả lời, không tự mở rộng.\n\n## Thiết kế\n\nTheo cách repo đang làm; đọc tài liệu và file quy tắc của repo trước. Ưu tiên cơ chế sẵn có hơn tự viết.\n\n## Chi phí đường nóng\n\nVới đoạn chạy thường xuyên, tránh truy vấn lặp theo từng dòng và tránh tải dữ liệu không dùng.\n\n## Kiểm chứng\n\nThêm test cho đúng hành vi vừa đổi. Chạy kiểm tra trong phạm vi file bị ảnh hưởng và báo kết quả thật; không báo xong khi còn test đỏ, test bị bỏ qua hay chưa chạy thử.\n\n## CI lỗi\n\nĐọc log của check, tìm nguyên nhân, sửa nguyên nhân. Không tắt check để cho xanh.\n\n## Review\n\nSửa mọi mục must fix. Mục nào không đồng ý thì trả lời kèm lý do trong luồng.\n\n## Bàn giao\n\nTrên runner dùng chung, theo giới hạn trong skill \`ds-app-rules\`.\nCommit và push lên nhánh của công việc, không viết lại lịch sử (riêng việc khởi tạo dự án được commit mốc gốc lên nhánh mặc định). Trả lời một lần: đã đổi gì, đã kiểm chứng thế nào, còn gì chưa làm.\n`,
      '---\nname: ds-development\ndescription: "Cách làm một bước đổi code: thiết kế, kiểm chứng, xử lý CI, nhận review và bàn giao. Dùng khi được giao sửa code."\n---\n\n# Làm một bước phát triển\n\n## Làm một bước\n\nChỉ làm đúng bước được giao. Thấy việc khác cần làm thì nêu trong phần trả lời, không tự mở rộng.\n\n## Thiết kế\n\nTheo cách repo đang làm; đọc tài liệu và file quy tắc của repo trước. Ưu tiên cơ chế sẵn có hơn tự viết.\n\n## Chi phí đường nóng\n\nVới đoạn chạy thường xuyên, tránh truy vấn lặp theo từng dòng và tránh tải dữ liệu không dùng.\n\n## Kiểm chứng\n\nThêm test cho đúng hành vi vừa đổi. Chạy kiểm tra trong phạm vi file bị ảnh hưởng và báo kết quả thật; không báo xong khi còn test đỏ, test bị bỏ qua hay chưa chạy thử. Bắt buộc nộp lượt Kiểm chứng (`ds-studio verify submit`) đối chiếu với toàn bộ tiêu chí nghiệm thu của việc; chỉ chuyển sang in_review khi kết quả Kiểm chứng đạt (passed). Nếu thất bại liên tiếp đến ngưỡng giới hạn (mặc định 2 lần), việc sẽ tự động chuyển sang Đang vướng (Blocked).\n\n## CI lỗi\n\nĐọc log của check, tìm nguyên nhân, sửa nguyên nhân. Không tắt check để cho xanh.\n\n## Review\n\nSửa mọi mục must fix. Mục nào không đồng ý thì trả lời kèm lý do trong luồng.\n\n## Bàn giao\n\nTrên runner dùng chung, theo giới hạn trong skill `ds-app-rules`. Commit và push lên nhánh của công việc, không viết lại lịch sử (riêng việc khởi tạo dự án được commit mốc gốc lên nhánh mặc định). Trả lời một lần: đã đổi gì, đã kiểm chứng thế nào, còn gì chưa làm.\n',
    ],
  ),
  skill(
    'ds-approach',
    'project',
    1,
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
    3,
    'Cách review một pull request và viết kết luận. Dùng khi được giao review ở chế độ chỉ đọc.',
    `
# Review pull request

Đọc diff, đối chiếu với mô tả công việc, danh sách tiêu chí nghiệm thu và kết quả kiểm chứng mới nhất. Chạy test liên quan nếu được. Không sửa code.

## Chấm theo tiêu chí nghiệm thu

Kiểm tra từng tiêu chí trong danh sách \`criteriaChecks\`. Nếu có bất kỳ tiêu chí nào chưa đạt (passed = false), verdict bắt buộc phải là \`changes\` (hoặc \`reject\`), tuyệt đối không được nộp \`approve\`.

## Bốn mức

- **Must fix:** sai hành vi, lỗi bảo mật, mất dữ liệu, thiếu test cho thay đổi quan trọng.
- **Should fix:** nên sửa nhưng không chặn merge.
- **Note:** ghi nhận, không cần hành động.
- **Pre-existing:** lỗi có từ trước, không do thay đổi này.

## Kết luận

Mỗi mục nêu file, dòng và hậu quả cụ thể. Nộp phiếu review có cấu trúc bằng lệnh \`ds-studio review submit\`, rồi kết thúc bằng đúng một trong hai câu: "Có thể merge" hoặc "Chưa thể merge".
`,
    [
      `---\nname: ds-review\ndescription: "Cách review một pull request và viết kết luận. Dùng khi được giao review ở chế độ chỉ đọc."\n---\n\n# Review pull request\n\nĐọc diff, đối chiếu với mô tả công việc và chạy test liên quan nếu được. Không sửa code.\n\n## Bốn mức\n\n- **Must fix:** sai hành vi, lỗi bảo mật, mất dữ liệu, thiếu test cho thay đổi quan trọng.\n- **Should fix:** nên sửa nhưng không chặn merge.\n- **Note:** ghi nhận, không cần hành động.\n- **Pre-existing:** lỗi có từ trước, không do thay đổi này.\n\n## Kết luận\n\nMỗi mục nêu file, dòng và hậu quả cụ thể. Nộp phiếu review có cấu trúc, rồi kết thúc bằng đúng một trong hai câu: "Có thể merge" hoặc "Chưa thể merge".\n`,
    ],
  ),
  skill(
    'ds-app-rules',
    'project',
    1,
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
    1,
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
