# Đặc tả API của demo NocoBase Studio, bắt bằng REA (10/11/2026)

Nguồn: REA `capture_browser_scenario` (Chrome headless, chế độ launch) trên `https://studio.demo.nocobase.com/main`
(`v1.0.0-beta.75`, tự đăng nhập Super Admin). Chỉ đọc: không bấm nút ghi; demo trả `400 DEMO_READ_ONLY` cho lệnh ghi.

**Giới hạn:** thân phản hồi về dạng base64 và chỉ giải mã vài trăm byte đầu, nên danh sách trường là *đã quan sát nhưng chưa
đủ*. "Suy luận" được ghi rõ. Mọi đường dẫn dưới `/main/api/`; phản hồi bọc `{data, meta?}`. Bỏ qua auth, i18n, demoMode,
studioLicense. Phần còn thiếu ở cuối tệp phải bắt bù ở bước P0b.

## Gọi ở mọi trang (khung)

| Đường dẫn | Hình dạng | Dùng cho |
|---|---|---|
| GET `attention` | `{items[{key:"issue:<id>",subject{type,id},path,label,reasons:["accept"],version,events[]}],total,mentions[],counts{tasks,sessions}}` | huy hiệu My issues / My sessions |
| GET `inbox/pending` | `{decision,info}` | số trên biểu tượng hộp thư |
| GET `agents/agentNames` | `[{id,name,nameText}]` | nhãn agent |
| GET `authorization/permissions` | — | quyền |
| WS `/main/ws` | `{type:"subscribe",id:"rt:N",topic}`; topic: `agent-sessions`, `agents:conversations`, `agents:runners`, `studio:conversations:attention`, `studio:inbox`, `studio:issues:runs`, `studio:git`, `studio:push`, `pm:changes`, `notifications:in-app`, `authorization:permissions-changed[:global]`, `studio:manager:identity` | cập nhật tức thời |

Sidebar: My issues, My sessions (`/agent-sessions`), Dashboard · Development: Issues, Projects, Knowledge, Project memory ·
Releases: Releases, Hosted environments (`/environments`) · Agent management: Agents, Runtimes, Skills, Usage · Settings
(`/config`). Đầu trang: thu gọn, breadcrumb, My sessions, Inbox (`/inbox`), avatar. Menu avatar: Account settings, Use Studio
in your agent, Language, Theme, Sign out.

Route đã thấy: `my-issues(?issue=&comment=)`, `agent-sessions`, `agent-sessions/runner/:id`, `dashboard`, `issues`,
`issues/PM-6401`, `projects`, `projects/:id/{overview,issues,knowledge,memory,members,releases,settings}`, `knowledge`,
`project-memory`, `releases`, `environments`, `agents`, `agents/:agentId`, `runtimes`, `skills`, `skills/:id`,
`usage(?prices=1)`, `inbox`, `config/{general,labels,license,members,roles,roles/:key,api-keys,git,demo-mode}`.

## Dashboard (`/dashboard`)

Kỳ 7/30/90 ngày không ghi vào URL; mặc định 30. Đổi kỳ gọi lại delivery, agents, projects (không gọi lại attention).

| Đường dẫn | Tham số | Hình dạng | Vùng |
|---|---|---|---|
| GET `reports/delivery` | `days` | `{days,from,to,subjects,currency,current{completed,cycleTimeP50Ms,agentShare,costPerIssue{USD}},previous{…},buckets[{from,to,completed,cycleTimeP50Ms,agentShare,costPerIssue}]}` | 4 ô KPI + sparkline |
| GET `reports/agents` | `days` | `{current{runs,successRate,reworkRate,runsPerIssue,interventionRate,queueWaitP50Ms},previous{…},daily[{day,runsCompleted,runsFailed,runsCancelled,…}]}` | Hiệu suất agent, biểu đồ lượt chạy |
| GET `reports/projects` | `days` | `{projects[{id,name,total,done,completed,cycleTimeP50Ms,…}]}` | bảng theo dự án |
| GET `reports/attention` | — | `{subjects,blocked{total,items[{id,identifier,title,since}]},…}` + phần PR chờ duyệt | Cần chú ý |

## My issues (`/my-issues?issue=<id số>`)

Chế độ xem: Split (mặc định) / Table / Board / Agent queue. Issue đầu tự được chọn.

| Đường dẫn | Tham số | Hình dạng | Vùng |
|---|---|---|---|
| GET `taskGroups` | `involvesUserId=<tôi>&mode=split&follow=all` | `{generation,membership,mode,groups[{group:"wait"…,count,data[{dependencyWait,blockers[],issue{id,number,identifier,title,description,statusKey,needsYou,next,acceptance,…}}]}],following[],waiting}` | danh sách nhóm |
| GET `projects`, `projects/members`, `projects/executors` | — | `[{id,name}]`; `[{userId,name,email}]`; `[{type:"agent",id,name,online,busy,isDefault}]` | bộ lọc Dự án / Chủ / Người thực hiện |
| POST `agentBoard/issueWork` | `{issueIds[]}` | `[{issueId,agentId,working}]` | dấu "Agent đang làm" |
| GET `projects/issues/:id` | — | trường issue + `activities[{id,actorType,actorId,actorName,action,details}]` + `threads[{root{id,authorType,authorName,kind:"comment",content},replies}]` | đầu trang, Mô tả, Hoạt động |
| GET `issuePanels/:id` | `adminPassword=true` | `{progress{state:"inReview",agent,step,since,runner,pullRequest,needsYou,explanationCommentId,next,handOver,personalRunnerRequests[]},ownerHandoff{handoff,canClaim,canDecide},commentRunLimit,decisions[],pullRequests{data[{id,repo,number,url,title,state,draft,headRef,baseRef,headSha,mergeCommitSha,authorLogin,provider,mergeability:"clean",hostMergeState,ciState:"success",checks[{kind,name,status,conclusion,url}]}]}}` | thẻ "Cần bạn", Merge / Gửi lại, PR + CI |
| GET `projects/issues/:id/screenshots` | — | `[{id,filename,ext,mimeType,size,contentUrl}]` | ảnh trong Báo cáo bàn giao |
| GET `agents/runs` | `subjectKind=issue&subjectId&pageSize=50`; tab Runs thêm `status=completed,failed,cancelled&pageSize=20` | `[{id,agentId,agentType:"runner",runnerId,sessionId,executions[],runnerName,…}]` | huy hiệu lượt chạy, tab Lượt chạy |
| GET `agents/runAgents` | `subjectKind,subjectId` | `[{id,name,nameText}]` | lọc agent ở tab Lượt chạy |
| GET `agents/studio-project-manager` | — | `{id,name:"Lead Agent",description}` | chip Arrange |
| GET `git/marks` | `issueIds` | chưa giải mã | dấu phát hành |
| POST `followUps/issues/:id/markSeen` | — | — | trang tự gửi khi mở issue |
| GET `projectSetups/:projectId`, `projects/:projectId`, `projects/labels`, `projects/apiKeyActors` | — | — | thuộc tính |

Báo cáo bàn giao là markdown trong `issue.acceptance` ("## Delivery report / ### Result / ### Evidence"), không có endpoint riêng.
Suy luận: nút "All / Conversation only" và tab Mô tả không gọi API.

## Issues (`/issues`)

Bảng là mặc định (không tham số); Board ghi `?view=board`; Agent queue ghi `?view=agent`.

| Đường dẫn | Tham số | Vùng |
|---|---|---|
| GET `taskGroups` | `mode=table&follow=scope` | bảng nhóm |
| GET `projects/issues/statuses` | — | `[{key,name,category,color}]`, cột/lọc trạng thái |
| GET `projects/issues/board` | `orderBy=updatedAt desc&pageSize=50` | bảng kanban |
| GET `agentBoard` | — | làn theo agent ("Now", "Up next", "Waiting for reply") |

## Hộp thư (`/inbox`)

Tab "To decide", "Notifications", "All". GET `inbox/waiting` → `[{item{id,deliveryId,notificationId,title}}]`; GET
`inbox/notices?ids=` → `[{notificationId,source:"releases",kind:"decision",type,subject{type,id,label}}]`; GET
`notificationInApp/messages?pageSize=25`; GET `notificationInApp/messages/unreadCount` → `{count}`; GET `projects/plans?status=open`.

## My sessions (`/agent-sessions/runner/:conversationId`)

Chip All / Needs me / In progress **không gọi API và không đổi URL** (lọc tại trình duyệt).

| Đường dẫn | Tham số | Hình dạng | Vùng |
|---|---|---|---|
| GET `agents/conversations` | `archived=false` | `[{id,links[{kind:"issue",targetId,origin,view{key:"PM-6293",title,status,url}}],title,titleSource,category:"chat",source:"panel",projectId,mode:"runner",execution{status:"idle"},agent{id,name,nameText,avatar},read,lastMessageAt,archivedAt,run,runner,lastSeq,seenSeq,needsYou{reason:"confirm",seq,text}}]` | danh sách, thẻ "Needs you", nhóm ngày |
| GET `agents/conversations/:id` | — | như một phần tử | đầu hội thoại, khung Issues |
| GET `agents/conversations/:id/messages` | — | `[{id,role,metadata{conversationId,createdAt,agentId,turnId,executionId,seq,revision},parts[{type:"text",text,state} \| {type:"dynamic-tool",toolName:"Bash",toolCallId,state:"output-available",input{command}}]}]` | tin nhắn; "Ran N commands" = gom part `dynamic-tool` (suy luận) |
| GET `agents/conversations/:id/usage` | — | `{inputTokens,cacheReadTokens,outputTokens,runs,context,costUsd}` | khung Usage, dòng token |
| GET `projects/issues/summaries` | `refs=id1,id2` | `[{id,identifier,title,statusKey}]` | chip issue, khung Issues |
| GET `agents/chatAgents` | — | `[{id,name,description,effort,efforts[]}]` | chọn agent trong ô soạn |
| GET `projects` | — | — | chọn dự án |

## Dự án (`/projects/:id/<tab>`)

`/projects/:id` chuyển hướng tới `/overview`. Tab là đoạn đường dẫn; Cài đặt nhận `?section=directories` (`repo`, `edit` chưa thử).
Mọi tab tải `projects/:id`, `projects/me`, `projects`, `projects/issues/statuses`.

| Đường dẫn | Tham số | Hình dạng | Tab |
|---|---|---|---|
| GET `projects/:id` | — | `{id,name,description,visibility,status,priority,leadUserId,startDate,dueDate,setupIssueId,lead{id,name},memberCount,issueCounts{total,done,byStatus{backlog,blocked,cancelled,done,in_progress,in_review}}}` | thuộc tính, số liệu |
| GET `projects/me` | — | `{userId,name,permissions{scopes{"pm.projects/view":"all"}}}` | ẩn/hiện theo quyền |
| GET `projectSetups/:id` | — | `{data:null}` khi không còn việc | thẻ "Next steps" |
| GET `repositoryDeployments/:repoId/ci/connection` | — | `{resourceId,repo,key,secretName:"NB_STUDIO_API_KEY",secretKind,provider}` | thẻ CI ở Tổng quan |
| GET `deploys/projects/:id/unreleasedIssues` | — | `{projectId,hasProduction,hasPreview,items[{id,identifier,title}]}` | Tổng quan + huy hiệu tab |
| GET `taskGroups` | `projectId&mode=table&follow=scope` | (quá lớn, chưa bắt) | Issues |
| GET `deploys/marks` | `issueIds` | `{}` | Issues |
| GET `knowledge/capabilities`; `knowledge/spaces` | `scope=project&scopeId` | `{semanticSearch,proposals}`; `[{space{id,scope,scopeId,title,inherited,access{read,propose,edit,manage}},docs[{id,kind:"article",spaceId,parentId,sortOrder,slug}]}]` | Tri thức |
| GET `projectMemory`; `projectMemory/:pid/repos/:rid` | — | `[{id,title,repos[{id,name,provider,defaultBranch,memories}]}]`; `{repo,sha,readAt,checkedAt,webUrl,check{ok,memories[{path:".nb-studio/memory/*.md",slug}]}}` | Bộ nhớ |
| GET `git/status`; `git/projects/:id` | — | `{enabled,connections[]}`; `{attribution:"withAgent"}` | Cài đặt |

## Tri thức, Bộ nhớ dự án

`/knowledge`: GET `knowledgeDirectory` → `[{space{scope:"project"|"system",scopeId,id,title,inherited,access},documents,archivedDocuments}]`;
mở một nút gọi `knowledge/spaces?scope=project&scopeId=`. `/project-memory`: như tab Bộ nhớ.

## Phát hành (`/releases?tab=&project=`)

| Đường dẫn | Tham số | Hình dạng |
|---|---|---|
| GET `deploys/hubCounts` | `projectId?` | `{test,previews,releases,unreleased,tagVersions,pendingVersionTasks}` — số trên tab |
| GET `deploys/versionPipelines` | `page=1&pageSize=100` | `[{id,name,canManage,pendingTasks,previewCount,latestDeployment,state,repositories[{repoId}]}]` — danh sách dự án bên trái |
| GET `deploys/pendingVersionTasks` | `page,pageSize,projectId?` | `[{id,projectId,identifier,title,statusKey,updatedAt,merged,published,unknown,tested,inTest,pullRequests[{id,number,title,url,repoId}]}]` |
| GET `deploys/environments` | `page,pageSize` | `[{appId,appName,project{id,name},repo,environment{id}}]` — tab Staging |
| GET `deploys/pipelines`, `deploymentRecords`, `versions` | `projectId` | `[{project,lead,canManage,preview{ready,total,latest}}]`; `meta{total,page,pageSize}`; `[{id,projectId,canManage,repoId,repo}]` |

## Môi trường (`/environments`)

GET `releases/me` → `{userId,kind,permissions{scopes{"rel.apps/view"}}}`; GET `releases/environments` →
`[{id,name,driver:"host",config{backend},hasSecret,secretKeys,publicUrl:"/{appId}/",protected,approvers,maxApps,defaultIdleStopMinutes,defaultDormantAfterHours,registryId,capabilities{archives,images,onDemand},sampleDataOnFirstDeploy,purpose,createdAt}]`;
GET `releases/hosts`; GET `releases/drivers` → `[{kind,title{key,ns},configSchema,secretSchema,capabilities}]`.

## Agents, Runtimes, Skills, Usage

| Trang | Đường dẫn | Hình dạng |
|---|---|---|
| Agents | GET/PATCH `projectManager` | `{name,description,delegationQueueTimeoutSeconds,firstChoiceAgentId,fallbackAgentId,fallbackAfterSeconds,principles,commentRunLimit,builtInPrinciples,choices[{id,name,description,online}],canEdit}` |
| Agents | GET `agents` | (quá lớn, chưa bắt) |
| Runtimes | GET `agents/runners` | `[{id,name,hostname,os,arch,version,tools[{kind,authenticated}],enabledTools,trust:"team",ownerUserId,status,slots,toolLoad,toolSlots,activeRuns,lastSeenAt,canManage,canChangeTrust,canRevoke}]` |
| Skills | GET `agents/skills` | `[{id,slug,name,description,version,fileCount,size,scriptCount,updatedAt}]` |
| Usage | GET `agents/usage?from&to&groupBy=agent&series=true` | `{from,to,groupBy,rows[{key,name,runs,durationMs,inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,reasoningTokens,cost{USD},pricedRuns}],totals{…},daily[{day,…,cost{USD},series[{key,…,cost}]}]}` — **server tính chi phí** |
| Usage | GET `agents/usage/models`, `agents/users`, `agents/vocabulary`, `agents/models` | bộ lọc |
| Set prices | GET `agents/prices` | `{items[{id,tool:"claude",modelService,model:"claude-3-5-haiku*",inputPerM,outputPerM,cacheReadPerM,cacheWritePerM,currency,note}],subscriptions[tool]}`; công cụ "thuê bao" = `{model:"*", giá 0}` (từ bundle) |

## Cài đặt (`/config/*`)

Sidebar: Back · Workspace (Demo Mode, General, Labels, License) · Members & access (Members, Roles, API keys) · Integrations (Git).

| Trang | Đường dẫn | Hình dạng |
|---|---|---|
| General | GET `projects/settings`; `access/settings` | `{issuePrefix}`; `{defaultRole:"contributor"}` |
| Labels | GET `projects/labels` | `[{id,name,color}]`; màu: gray, red, orange, yellow, green, blue, purple |
| Members | GET `users?page&pageSize=50&sort=name&status=enabled`; `users/options`; `projects/invitations`; `access/me` | `[{id,name,username,email,disabledAt,kind:"person",roleScopes{studio:["admin"]}}]` |
| Roles | GET `access/roles`; `access/members` | `[{key,title,builtIn,editable,pages[],settings{"pm.general/read":true}}]`; `[{userId,name,email,roles[]}]` (Holders đếm ở trình duyệt, suy luận) |
| API keys | GET `organizationKeys`; `organizationKeys/scopeOptions` | `{groups[{id,category,title,description}]}` |
| Git | GET `git/connections` | `[{id,provider,kind:"token",name,account,webUrl,demo,repo}]` |

## So với Dương Sinh Studio

- **Trùng đường dẫn:** `reports/*`, `attention`, `inbox/pending|waiting|notices`, `taskGroups`, `followUps/issues/:id/markSeen`,
  `issuePanels/:id`, `agentBoard`, `agentBoard/issueWork`, `projectSetups/:id`, `projectManager`, `access/*`, `knowledgeDirectory`,
  `knowledge/*`, `projectMemory`, `git/status`, `deploys/{versions,marks,deploymentRecords,pendingVersionTasks,hubCounts,environments}`.
- **Khác tên:** `git/marks` ↔ `deploys/marks`; `agents/runs`/`runAgents` ↔ client ta dùng `issueRuns`; client ta gọi
  `deploys/me`, `deploys/releases`, `deploys/pending`.
- **Của plugin:** `projects/*`, `agents/*`, `notificationInApp/*`, `users/*`, `releases/*`.
- **Chưa có ở ta:** `deploys/versionPipelines`, `deploys/pipelines`, tham số `follow` của `taskGroups`, các trường dòng
  `dependencyWait`/`blockers`/`needsYou`/`next`/`acceptance`.
- `/api/reports/delivery` của ta đã trả `costPerIssue` (và `tokensPerIssue`); `/api/reports/usage` bỏ `daily[].series`.

## Chưa bắt được (làm ở P0b)

- Tab "Code & previews" của issue (bấm bị quá thời gian hai lần); mở nhóm Done.
- Bộ lọc trạng thái trang Issues; tham số bộ lọc Project / Agent / Người và các lựa chọn "Group by" ở Usage.
- Thân đầy đủ: `taskGroups`, `knowledge/spaces`, `agents`, `pendingVersionTasks` theo dự án; tên khóa phần PR trong `reports/attention`.
- Các mục của tab Cài đặt dự án và ý nghĩa `edit=checks`; endpoint lưu giá.
- Topic ws ở cấp issue.

## Bổ sung P0b (lượt 2, 10/11/2026)

Bắt lại bằng REA 6.8.0 (`rea capture-browser-scenario`, Chromium của Playwright, chế độ launch). Chỉ điều hướng, mở tab và chọn
bộ lọc; không bấm nút ghi. `max_network_body_bytes` 8 MiB nên thân phản hồi **đầy đủ**, giải mã base64 bằng script. Danh sách
cuộc gọi đã khử trùng (bỏ auth, i18n, demoMode, studioLicense, id người dùng) ở `rea-luot-2-cuoc-goi.tsv`. Đường cơ sở giao
diện (ảnh 1440/820/390 px, `capture.json` có token thiết kế và bố cục) ở `craft/<trang>/`, chụp bằng Craft Anything ở chế độ
Clean room. Hai điểm lượt 1 suy luận sai hoặc thiếu được sửa bên dưới.

### taskGroups (My issues và Issues)

`GET taskGroups?mode=split|table&follow=all|scope[&involvesUserId][&statusKey][&projectId][&ownerUserId]` →
`{data:{generation,membership,mode,groups[{group,count,data[],nextCursor}],following[],waiting}}`.

- Chế độ `split` có **bốn** nhóm: `wait`, `doing`, `backlog`, `done`. Chế độ `table` có **sáu**: `wait`, `doing`, `review`,
  `blocked`, `backlog`, `done`. `count` là tổng của nhóm; `data` chỉ chứa trang đầu (50 dòng cho `done`, 202 tổng) và
  `nextCursor` là con trỏ không rõ nghĩa (base64) cho trang kế. `waiting` là số issue chờ bạn.
- Bộ lọc của trang Issues là tham số truy vấn của chính `taskGroups`: `statusKey`, `projectId`, `ownerUserId` (và Executor);
  tìm kiếm chưa bắt. Chế độ xem Board dùng `projects/issues/board?projectId&ownerUserId&orderBy=updatedAt+desc&pageSize=50`
  → `{data:{columns[{status,issues[],nextCursor}]}}`; Agent queue dùng `agentBoard?projectId&ownerUserId` →
  `{data:{rows[{agentId,state,run,queue,blockedBy[],waiting,idle,issue,others[],mine}],agents{<id>:{id,name,avatar,tool,model,
  models[],archived,online,active,maxConcurrentRuns}}}}`.
- Dòng (`groups[].data[]`): `{dependencyWait:boolean, blockers[{issueId,identifier,title,reason:"dependency"}],
  issue{id,number,identifier,title,description,statusKey,needsYou,next,acceptance,priority,ownerUserId,parentIssueId,stage,
  projectId,startDate,dueDate,revision,createdById,lastActivityAt,deletedAt,createdAt,updatedAt,executor{type,id},
  project{id,name,leadUserId},labels[],owner{id,name},executorName,subtaskCount,blockedCount}, parent, waits[], waitingSince,
  followed:boolean, unread:number, progress{total,finished}, hasChildren, context, expand[]}`.
- `projects/issues/statuses` → `{data:[{key,name,category,color}]}` với đúng sáu trạng thái cố định (`backlog`, `in_progress`,
  `blocked`, `in_review`, `done`, `cancelled`), trùng với plugin projects của ta. Bộ lọc Status liệt kê: All statuses, rồi
  sáu trạng thái đó.
- Dòng chú thích "Waiting for prerequisites: Waiting for PM-… to finish" lấy từ `dependencyWait` và `blockers`.

### Chi tiết issue — tab "Code & previews"

Thanh tab của issue (`tablist "Issue sections"`): **Activity N**, **Description**, **Code & previews N**, **Runs**. Tab
"Code & previews" liệt kê mỗi pull request: tiêu đề `repo#số`, liên kết, trạng thái (Open/Merged), CI (Checks passed), nút
**Merge** và menu hành động, nhánh, "Linked by … · Read from GitHub …", dòng Checks (nhà cung cấp, số check, từng check với
nút Details), công tắc **"Complete the issue when merged"** (mô tả: khi mọi change request gắn với issue được merge thì issue
sang Done; mặc định bật ở demo) và khối **Preview environment** (Sleeping/Running, Head, Build, CI log, quản trị viên đầu tiên).
Công tắc này tương ứng với `autoCompleteOnMerge` đã làm ở commit `07c57ab` (mặc định của ta: tắt, xem §34).
`git/marks?issueIds=` → `{data:{<issueId>:{count,merged,state,ciState,conflict,url,label}}}`; `deploys/marks?issueIds=`.

### Dự án

- Thanh tab `tablist "Project sections"`: Overview, Issues N, Knowledge, Memory, Members N, Releases, Settings; mỗi tab là một
  đoạn đường dẫn `/projects/:id/<tab>`.
- **Settings** có điều hướng `Settings sections` với bốn mục qua `?section=`: `general` (Project name, Description, Commit
  attribution: "Me, with the agent as co-author" / "Me only"), `directories` (Code repositories), `variables` (Agent run
  variables: Variables and secrets, Reveal values, Add variable, full access log; tự lưu khi đổi), `skills` (Default skills:
  "Applies to" the whole project hoặc một repository, chọn skill, nút Save skills).
- Mục `directories`: thẻ mỗi repository (tên, nhà cung cấp, "Primary repository", menu hành động) với các dòng Default branch,
  **Checks** (GitHub Actions, Connected · last report …, nút Build records), Branch rules (`agent/{key}`), Release lines
  (`v*`, Latest …), Previews ("Created for every pull request · sleeps after 10 idle minutes"), Webhook; mỗi dòng có nút
  **Edit** (Edit Default branch / Checks / Branch rules / Release lines / Previews / Webhook). `edit=checks` của lượt 1 là
  hộp thoại của nút Edit Checks này.
- Tab **Releases** của dự án: bốn thẻ Preview / Staging / Release / Production (mỗi thẻ có nút hướng dẫn) rồi `tablist`
  "Previews N · Staging environments N · Releases N · Pending release N"; Pending release là bảng Issue / Where it is / Updated.

### Phát hành và môi trường

- `deploys/hubCounts` → `{data:{test,previews,releases,unreleased,tagVersions,pendingVersionTasks}}`.
- `deploys/versionPipelines?page&pageSize` → `{data:[{id,name,canManage,pendingTasks,previewCount,latestDeployment,state,
  repositories[],latestVersions[]}],meta}` (danh sách trái của trang Releases, theo dự án).
- `deploys/pendingVersionTasks?page&pageSize` → `{data:[{id,projectId,identifier,title,statusKey,updatedAt,merged,published,
  unknown,tested,inTest,pullRequests[]}],meta}`.
- `releases/environments` → `{data:[{id,name,driver,config,hasSecret,secretKeys[],publicUrl,protected,approvers[],maxApps,
  defaultIdleStopMinutes,defaultDormantAfterHours,registryId,capabilities{archives,images,onDemand},
  sampleDataOnFirstDeploy,purpose,createdAt,updatedAt,appCount}]}`; `releases/drivers` →
  `{data:[{kind,title{key,ns},configSchema,secretSchema,capabilities{logs,urlModes[],images,onDemand},variants,facts}]}`.

### Agents, Runtimes, Usage

- `agents` → `{data:[{id,name,description,nameText,avatar,source,status,tool,model,modelEntries[],instructions,actions[],
  confirmChanges,maxConcurrentRuns,maxAttempts,toolPolicy,lastReportedAt,revision,effort,efforts[],reported,
  runners{team,personal,mine,names[]},quota[],personalOnly,unusable,busy,suggestion{en,zh},canEdit,…}]}`; `projectManager`,
  `agents/skills`, `agents/models`, `agents/vocabulary`, `agents/prices`.
- `agents/runners` → `{data:[{id,name,hostname,os,arch,version,tools[],enabledTools[],trust,ownerUserId,ownerName,status,slots,
  toolSlots,activeRuns,activeJobs,activeByTool,lastSeenAt,canManage,canManageTools,canChangeTrust,canRevoke,takes[],
  updateVersion,takesCount,workspaceUsage}]}`.
- Usage: `agents/usage?from&to&groupBy=<agent|group|…>[&series=true][&groupId=<projectId>][&agentId=<id>][&userId=<id>]` →
  `{data:{from,to,groupBy,rows[{key,name,runs,durationMs,inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,
  reasoningTokens,cost{USD},pricedRuns}],totals,daily[{day,…tokens,cost}],unpricedModels[]}}`. Bộ lọc: **Project** → `groupId`,
  **Agent** → `agentId`, **Woken by** → `userId`, kèm Date range (`from`, `to`, mặc định 30 ngày). **Group by** liệt kê tám
  mục: Agent, Woken by, Project, Issue, Day, Model, Coding tool, Agent type (giá trị `groupBy` đã thấy: `agent`, `group`; sáu mục
  còn lại chưa bắt). Tab **Cost** và **Tokens** chỉ đổi cách hiển thị. `agents/users` → `{data:[{id,name}]}` cho "Woken by".
  `agents/usage/models` trả `{rows:[]}` khi chưa có giá.

### Knowledge

Lượt 1 ghi `knowledge/spaces`; thực tế trang gọi `knowledgeDirectory` →
`{data:[{space{scope,scopeId,id,title,inherited,access{read,propose,edit,manage}},documents,archivedDocuments}]}` và
`knowledge/capabilities` → `{data:{semanticSearch,proposals}}`, cộng `access/me`, `access/roles`.

### Vẫn chưa bắt

Sáu giá trị còn lại của `groupBy` ở Usage; tham số tìm kiếm văn bản của Issues; nội dung thân mới của các hộp thoại Edit trong
Cài đặt repository (cần bấm Edit, có thể làm ở P6 khi cần); bộ lọc "Rows per page" và sắp xếp của danh sách Projects.
