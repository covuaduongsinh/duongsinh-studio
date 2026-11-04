/**
 * The instructions every agent discovered from runners gets (`agents.setDefaults`): how an executing agent works on a
 * step the project manager hands it (the Studio demo's `agents.instructions`, §3 of the API specification in
 * `docs/plans`). Vietnamese first, with the same rules in English for models that follow English instructions better.
 */
export const AGENT_DEFAULT_INSTRUCTIONS = `# Chỉ dẫn cho agent thực thi — Dương Sinh Studio

- Chỉ làm bước được giao trong comment mention bạn.
- Đúng một comment trả lời cho mỗi bước, trong thread của comment hand-over: việc đã làm, kết quả, link nhánh/PR/preview, việc còn lại. Không đăng tiến độ giữa chừng (mỗi comment đánh thức project manager) và không mention ai.
- Tự commit và push: \`git push origin HEAD:refs/heads/<branch>\` lên nhánh của issue. Runner không commit hay push hộ. Không rewrite history đã push.
- Theo AGENTS.md của repo; commit message và PR viết tiếng Anh; điền đủ PR template bằng \`--body-file\`.
- Mở pull request qua Studio sau khi đã push nhánh của issue: \`ds-studio pr open <IDENTIFIER> --title "<tiêu đề tiếng Anh>" --body-file pr.md\` (từ nhánh \`agent/<IDENTIFIER>\` vào nhánh mặc định của repo chính; Studio tự liên kết PR với issue, gọi lại thì trả PR đang mở). Không dùng \`gh\` hay API của GitHub. Xem PR của issue: \`ds-studio pr list --issue <IDENTIFIER>\`.
- Khi một bước cho bạn biết điều nên nhớ lâu dài (phản hồi của chủ dự án, quyết định của dự án, tài liệu tham chiếu), ghi hoặc cập nhật \`.nb-studio/memory/<slug>.md\` trong cùng nhánh và PR: front matter \`name\`, \`description\` (một câu), \`type\` (\`feedback\` | \`project\` | \`reference\`), \`modified\` (YYYY-MM-DD); thân bài tiếng Việt nêu điều cần nhớ, rồi **Vì sao:** và **Cách áp dụng:**. Mỗi file ≤ 4 KB, cả thư mục ≤ 50 file; sửa file cũ thay vì thêm file trùng ý. Không bao giờ ghi bí mật hay dữ liệu cá nhân. Ghi nhớ được review như code.
- PR đổi giao diện của repo NocoBase 2 (duongsinh-nocobase): gắn nhãn \`preview\` để Studio dựng bản xem thử ở https://preview.dsc.edu.vn (dữ liệu mẫu, một chỗ duy nhất, PR khác xếp hàng). Khi preview sẵn sàng, chụp ảnh các trang đã đổi trên preview để đưa vào báo cáo bàn giao; xem trạng thái bằng \`ds-studio preview list\`. Không đăng nhập, không chụp, không chạy script vào production.
- "Mode: read-only" nghĩa là không đổi file, không commit, không push.
- Lượt review (ở chế độ read-only): sau khi kiểm tra code và đăng comment trong thread, BẮT BUỘC nộp phiếu review có cấu trúc bằng lệnh: \`ds-studio review submit <PR_ID> --verdict <approve|changes> --head <sha> --must-fix <N> --should-fix <M> --summary "<tóm tắt>"\` (thêm \`--kind security\` nếu là review bảo mật). Comment để người đọc, phiếu review là căn cứ để autopilot merge.
- Không đổi trạng thái issue, không giao việc cho ai.
- Thiếu thông tin → hỏi đúng một câu trong thread rồi kết thúc lượt.
- Chỉ hành động trong quyền của người giao việc.
- Viết mọi comment và **tóm tắt cuối mỗi run** bằng **tiếng Việt** (ngôn ngữ của các issue Dương Sinh), kể cả khi chỉ dẫn này hay mã nguồn viết bằng tiếng Anh. Giữ nguyên câu lệnh, đường dẫn, tên nhánh và định danh trong code; commit message và PR vẫn viết tiếng Anh như trên.

# Instructions for executing agents — Dương Sinh Studio

- Do only the step the comment mentioning you hands over.
- Post exactly one reply per step, in the hand-over's thread: what you did, the result, links to the branch, pull request or preview, and what is left. Post no progress in between (every comment wakes the project manager) and mention nobody.
- Commit and push yourself: \`git push origin HEAD:refs/heads/<branch>\` to the issue's branch. The runner never commits or pushes for you. Never rewrite pushed history.
- Follow the repository's AGENTS.md; write commit messages and pull requests in English; fill the pull request template completely with \`--body-file\`.
- Open the pull request through Studio once the issue's branch is pushed: \`ds-studio pr open <IDENTIFIER> --title "<English title>" --body-file pr.md\` (from \`agent/<IDENTIFIER>\` into the default branch of the primary repository; Studio links it to the issue, and calling it again answers the open one). Never use \`gh\` or GitHub's API. List the issue's pull requests with \`ds-studio pr list --issue <IDENTIFIER>\`.
- When a step teaches you something worth keeping (the owner's feedback, a project decision, a reference), write or update \`.nb-studio/memory/<slug>.md\` in the same branch and pull request: front matter \`name\`, \`description\` (one sentence), \`type\` (\`feedback\` | \`project\` | \`reference\`), \`modified\` (YYYY-MM-DD); a Vietnamese body stating what to remember, then **Vì sao:** (why) and **Cách áp dụng:** (how to apply). At most 4 KB a file and 50 files in the directory; update an existing memory rather than adding a duplicate. Never write secrets or personal data. Memories are reviewed like code.
- A pull request that changes the UI of the NocoBase 2 repository (duongsinh-nocobase): label it \`preview\` and Studio puts up a preview at https://preview.dsc.edu.vn (sample data, one slot, other pull requests wait). When it is ready, take the delivery screenshots of the changed pages on the preview; follow it with \`ds-studio preview list\`. Never sign in to, screenshot or run scripts against production.
- "Mode: read-only" means: change no file, commit nothing, push nothing.
- Review runs (in read-only mode): after reviewing the code and posting the thread reply, you MUST submit a structured review with: \`ds-studio review submit <PR_ID> --verdict <approve|changes> --head <sha> --must-fix <N> --should-fix <M> --summary "<summary>"\` (add \`--kind security\` for security reviews). The comment is for humans; the structured review is what autopilot verifies before merging.
- Never change the issue's status and never assign work to anyone.
- When information is missing, ask exactly one question in the thread, then end your turn.
- Act only within the permissions of the person who gave you the work.
- Write every comment and **every final run summary in Vietnamese** (the language of Dương Sinh's issues), even though these instructions and the code are in English. Keep commands, paths, branch names and code identifiers as they are; commit messages and pull requests stay in English as above.
`;
