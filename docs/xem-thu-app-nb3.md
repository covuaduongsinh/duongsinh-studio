# Xem thử (preview) theo PR cho app NocoBase 3 (M4.3)

Mỗi repo app NB3 (ví dụ `covuaduongsinh/nocolms`) có **một App xem thử cố định**: môi trường `preview`, một tên miền riêng
(ví dụ `nocolms-preview.dsc.edu.vn`, một bản ghi A, không wildcard), `maxApps` 1, tự dừng sau 30 phút không dùng. Vì chỉ có
một App nên chỉ một PR được xem thử tại một thời điểm; PR mới thay bản của PR cũ.

## Ai làm gì

| Bước                                       | Ai                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dựng `dist` cho PR có nhãn `preview`       | **GitHub Actions của repo app** (mẫu bên dưới). Studio không build.                                                                                               |
| Tải archive lên App xem thử và deploy      | Workflow, bằng khoá API có phạm vi **chỉ App xem thử** (`upload` + `deploy`), kèm nhãn bản phát hành `pr=<số PR>` và `sha=<commit>`.                              |
| Dừng khi PR đóng hoặc bị gỡ nhãn `preview` | **Studio** (`server/releases/nb3-preview.ts`): nhận webhook `pull_request`, chỉ dừng khi bản đang chạy có nhãn `pr` đúng số PR đó; bản của PR khác không bị đụng. |
| Xoá hẳn App xem thử                        | Không tự động. App xem thử là App cố định, chỉ dừng.                                                                                                              |

## Việc chủ dự án làm một lần cho mỗi repo

1. Bản ghi A `<app>-preview.dsc.edu.vn` → `217.15.160.118` (Mắt Bão).
2. Trong Studio: môi trường `preview` (driver `dokploy`, `hosts` có `<app>-preview` → tên miền ở trên, `maxApps` 1, tự dừng 30), App
   `<app>-preview`, rồi trong trang repo gán App đó cho môi trường `preview`.
3. Khoá API có phạm vi chỉ App đó (`upload`, `deploy`) lưu thành secret `STUDIO_API_KEY` của repo app, cùng `STUDIO_URL`.
4. Thêm workflow mẫu bên dưới vào `.github/workflows/preview.yml` của repo app (đẩy file workflow cần token có quyền Workflows).

## Workflow mẫu cho repo app

```yaml
name: preview
on:
  pull_request:
    types: [labeled, synchronize, reopened]
jobs:
  preview:
    if: contains(github.event.pull_request.labels.*.name, 'preview')
    runs-on: ubuntu-latest
    concurrency: { group: nb3-preview, cancel-in-progress: true } # một chỗ mỗi lúc
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build --target linux-x64 --node-version 24
      - run: tar -czf dist.tar.gz --exclude='*/.bin' --exclude=dist/.env dist config.example.yml
      - name: Upload and deploy to the preview App
        env:
          STUDIO_URL: ${{ secrets.STUDIO_URL }}
          STUDIO_API_KEY: ${{ secrets.STUDIO_API_KEY }}
          APP_ID: <app>-preview
          PR: ${{ github.event.pull_request.number }}
          SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          # 1. a one-time upload ticket (never echo the key or the ticket)
          ticket=$(curl -fsS -X POST "$STUDIO_URL/api/releases/apps/$APP_ID/uploadTickets" \
            -H "x-api-key: $STUDIO_API_KEY" -H 'content-type: application/json' -d '{"deploy":true}')
          token=$(jq -r .data.token <<<"$ticket"); path=$(jq -r .data.path <<<"$ticket")
          # 2. the archive, labelled with its pull request, deployed on arrival
          curl -fsS -X POST "$STUDIO_URL/api$path" \
            -H "Authorization: Bearer $token" \
            -H "X-Artifact-SHA256: $(sha256sum dist.tar.gz | cut -d' ' -f1)" \
            -H 'X-Release-Deploy: true' \
            -H "X-Release-Labels: {\"pr\":\"$PR\",\"sha\":\"$SHA\"}" \
            --data-binary @dist.tar.gz -o /dev/null
```

Chưa kiểm trên GitHub thật: đường dẫn ticket (`/api/releases/apps/…`) lấy từ tài liệu route của plugin `releases`; khi chạy lần đầu hãy so với
`<studio>/api/swagger`. Lỗi build hiện chỉ hiện trong tab Actions của PR; báo vào Hộp thư và push là phần còn lại của M4.3.
