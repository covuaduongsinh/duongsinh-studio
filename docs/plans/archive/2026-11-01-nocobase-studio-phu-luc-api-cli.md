# Phụ lục: kiểm kê API và lệnh CLI của NocoBase Studio 1.0.0-beta.71 (01/11/2026)

> Trích xuất tự động từ tài liệu OpenAPI (`GET /main/api/swagger`, 653 thao tác, 267 schema) và manifest lệnh CLI (`GET /main/api/cli/manifest`, phiên bản 4, 389 lệnh) của demo https://studio.demo.nocobase.com/ sau khi đăng nhập tài khoản demo mặc định. Dùng làm bản đối chiếu khi dựng Dương Sinh Studio (xem `2026-11-01-nocobase-studio-ke-hoach-phat-trien.md`). Nhóm thẻ `Studio` (186 thao tác) là phần **không có trong plugin mở**; các thẻ còn lại thuộc plugin mở trên `v3-develop`.

## A. Thao tác HTTP theo thẻ OpenAPI

## AgentSessions

- DELETE /api/agentSessions/computers/{computerId} — Remove a computer
- GET /api/agentSessions/computers — List your computers
- GET /api/agentSessions/computers/{computerId}/folders — List the folders in a directory of a computer
- GET /api/agentSessions/mentions — Find what a message can mention
- GET /api/agentSessions/projects — List the projects a session may work for
- GET /api/agentSessions/sessions — List your sessions
- GET /api/agentSessions/sessions/{sessionId} — Get a session
- GET /api/agentSessions/sessions/{sessionId}/events — Read a session's transcript
- GET /api/agentSessions/sessions/{sessionId}/images/{file} — Read an image sent in a session
- GET /api/agentSessions/sessions/{sessionId}/work — Get the work tied to a session
- PATCH /api/agentSessions/computers/{computerId} — Choose where sessions on a computer work
- PATCH /api/agentSessions/sessions/{sessionId} — Rename or archive a session
- POST /api/agentSessions/bridge/claim — Authorize a queued message to start
- POST /api/agentSessions/bridge/poll — Take a computer's commands
- POST /api/agentSessions/bridge/register — Register a computer
- POST /api/agentSessions/bridge/reply — Answer a command
- POST /api/agentSessions/bridge/report — Report what happened in a session
- POST /api/agentSessions/bridge/withdrawn — Confirm removal of a withdrawn message
- POST /api/agentSessions/computers/{computerId}/discoverChoices — Discover agent settings before a session
- POST /api/agentSessions/sessions — Start a session
- POST /api/agentSessions/sessions/{sessionId}/answer — Answer an agent's permission request
- POST /api/agentSessions/sessions/{sessionId}/cancel — Stop a session's turn
- POST /api/agentSessions/sessions/{sessionId}/choose — Change one of a session's choices
- POST /api/agentSessions/sessions/{sessionId}/links/decide — Start or skip the work tied to a session
- POST /api/agentSessions/sessions/{sessionId}/prompt — Send a message to a session
- POST /api/agentSessions/sessions/{sessionId}/seen — Record what the owner has seen of a session
- POST /api/agentSessions/sessions/{sessionId}/withdraw — Withdraw one queued message

## Agents

- DELETE /api/agents/chatAttachments/{attachmentId} — Discard a file not sent yet
- DELETE /api/agents/conversations/{conversationId} — Delete a conversation
- DELETE /api/agents/conversations/{conversationId}/links/{linkId} — Untie a record from a conversation
- DELETE /api/agents/runners/{runnerId} — Delete a runner
- DELETE /api/agents/services/{serviceName} — Delete a model service
- DELETE /api/agents/skills/{skillId} — Delete a skill
- DELETE /api/agents/variables/{scopeKind}/{scopeId}/{variableName} — Delete a variable
- GET /api/agents — List agents
- GET /api/agents/actions — List the business actions an agent may be given
- GET /api/agents/agentNames — List the names of agents
- GET /api/agents/available — List the agents the caller may give work to
- GET /api/agents/availableModels — List tools, or one tool’s models, to create an agent from
- GET /api/agents/chatAgents — List the agents the caller may chat with
- GET /api/agents/chatAttachments/{attachmentId}/content — Download a file sent in chat
- GET /api/agents/chatPreferences — Get the caller's chat preferences
- GET /api/agents/chatSettings — Get the team's chat settings
- GET /api/agents/conversationAttention — Count the caller's conversations that wait for them
- GET /api/agents/conversations — List the caller's conversations
- GET /api/agents/conversations/{conversationId} — Get a conversation
- GET /api/agents/conversations/{conversationId}/config — Read the saved OnlineAgent configuration
- GET /api/agents/conversations/{conversationId}/events — Resume the current OnlineAgent UI stream
- GET /api/agents/conversations/{conversationId}/links — List a conversation's links
- GET /api/agents/conversations/{conversationId}/messages — List a conversation's messages
- GET /api/agents/conversations/{conversationId}/usage — Get a conversation's token usage
- GET /api/agents/dist/installScript — Get the install script
- GET /api/agents/dist/manifest — Get the distribution manifest
- GET /api/agents/dist/products/{product}/targets/{target} — Resolve a product's current artifact for a platform
- GET /api/agents/dist/products/{product}/versions/{version}/files/{file} — Download a distribution file
- GET /api/agents/models — List the models of the model services
- GET /api/agents/prices — Get the model prices
- GET /api/agents/runRequests — List run requests
- GET /api/agents/runRequests/{requestId} — Get a run request
- GET /api/agents/runners — List runners
- GET /api/agents/runners/jobs/{jobId}/status — Get a job's status
- GET /api/agents/runners/registrationTokens — List usable runner registration tokens
- GET /api/agents/runners/runs/{runId}/mounts/{name} — Download one of a run's mounts
- GET /api/agents/runners/runs/{runId}/skills/{slug} — Download one of a run's skills
- GET /api/agents/runners/runs/{runId}/status — Get a run's status
- GET /api/agents/runners/{runnerId} — Get a runner
- GET /api/agents/runners/{runnerId}/runs — List a runner's recent runs
- GET /api/agents/runners/{runnerId}/work — List the work a runner holds
- GET /api/agents/runners/{runnerId}/workspaces — Read runtime workspace diagnostics
- GET /api/agents/runs — List runs
- GET /api/agents/runs/current — Get the run the token belongs to
- GET /api/agents/runs/current/context — Get the context of the token's run
- GET /api/agents/runs/{runId} — Get a run
- GET /api/agents/runs/{runId}/brief — Get a run's brief
- GET /api/agents/runs/{runId}/events — List a run's events
- GET /api/agents/services — List model services
- GET /api/agents/skillAttachments/{scopeKind}/{scopeId} — Get a scope's default skills
- GET /api/agents/skills — List skills
- GET /api/agents/skills/{skillId} — Get a skill
- GET /api/agents/skills/{skillId}/archive — Export a skill
- GET /api/agents/skills/{skillId}/versions — List a skill's versions
- GET /api/agents/skills/{skillId}/versions/{version} — Get a skill version
- GET /api/agents/skills/{skillId}/versions/{version}/file — Download a skill file
- GET /api/agents/usage — Get the usage report
- GET /api/agents/usage/models — Get the model usage outside runs
- GET /api/agents/users — List the people agents can be given to
- GET /api/agents/variables/{scopeKind}/{scopeId} — List a scope's variables
- GET /api/agents/variables/{scopeKind}/{scopeId}/audits — List a scope's variable audit
- GET /api/agents/vocabulary — Get the agents vocabulary
- GET /api/agents/{agentId} — Get an agent
- GET /api/agents/{agentId}/history — List an agent's history
- GET /api/agents/{agentId}/previewBrief — Preview an agent's full prompt
- PATCH /api/agents/chatPreferences — Update the caller's chat preferences
- PATCH /api/agents/chatSettings — Update the team's chat settings
- PATCH /api/agents/conversations/{conversationId} — Rename or archive a conversation
- PATCH /api/agents/conversations/{conversationId}/config — Update idle OnlineAgent configuration
- PATCH /api/agents/runners/{runnerId} — Update a runner
- PATCH /api/agents/runs/current/conversation — Name the token's conversation
- PATCH /api/agents/services/{serviceName} — Update a model service
- PATCH /api/agents/skills/{skillId} — Save a skill
- PATCH /api/agents/{agentId} — Update an agent
- POST /api/agents/chatAttachments — Upload a file to send in chat
- POST /api/agents/checkConnection — Check a model over a connection
- POST /api/agents/checkModel — Check that a model answers
- POST /api/agents/conversations — Create a conversation
- POST /api/agents/conversations/{conversationId}/approval — Respond to a native SDK tool approval
- POST /api/agents/conversations/{conversationId}/finalize — Retry response persistence without executing again
- POST /api/agents/conversations/{conversationId}/links — Tie a record to a conversation
- POST /api/agents/conversations/{conversationId}/markRead — Mark a conversation read
- POST /api/agents/conversations/{conversationId}/markSeen — Mark a conversation seen up to a message
- POST /api/agents/conversations/{conversationId}/messages — Send a message
- POST /api/agents/conversations/{conversationId}/messages/{messageId}/withdraw — Withdraw a queued message
- POST /api/agents/conversations/{conversationId}/queue — Queue a message while the agent works
- POST /api/agents/conversations/{conversationId}/resend — Resend an existing user message
- POST /api/agents/conversations/{conversationId}/stop — Stop a conversation's agent
- POST /api/agents/conversations/{conversationId}/switchAgent — Change a Runner conversation’s agent
- POST /api/agents/conversations/{conversationId}/switchRunner — Unbind a conversation from its runner
- POST /api/agents/discoverModels — Discover the models a provider lists
- POST /api/agents/dist/downloadTokens — Create a CLI download token
- POST /api/agents/runRequests/{requestId}/confirm — Confirm a run request
- POST /api/agents/runRequests/{requestId}/reject — Reject a run request
- POST /api/agents/runRequests/{requestId}/runAsMe — Run a run request as the caller
- POST /api/agents/runRequests/{requestId}/withdraw — Withdraw a run request
- POST /api/agents/runnerAgents — Create an agent from an available model
- POST /api/agents/runners/claim — Claim work for a runner
- POST /api/agents/runners/heartbeat — Send a runner heartbeat
- POST /api/agents/runners/jobs/{jobId}/cancelAck — Acknowledge a job's cancellation
- POST /api/agents/runners/jobs/{jobId}/complete — Complete a job
- POST /api/agents/runners/jobs/{jobId}/events — Report a job's events
- POST /api/agents/runners/jobs/{jobId}/fail — Fail a job
- POST /api/agents/runners/jobs/{jobId}/lease — Renew a job's lease
- POST /api/agents/runners/jobs/{jobId}/start — Report that a job started
- POST /api/agents/runners/register — Register a runner
- POST /api/agents/runners/registrationTokens — Create a runner registration token
- POST /api/agents/runners/runs/{runId}/cancelAck — Acknowledge a run's cancellation
- POST /api/agents/runners/runs/{runId}/complete — Complete a run
- POST /api/agents/runners/runs/{runId}/events — Report a run's events
- POST /api/agents/runners/runs/{runId}/fail — Fail a run
- POST /api/agents/runners/runs/{runId}/gitCredentials — Get a credential for one of a run's repositories
- POST /api/agents/runners/runs/{runId}/lease — Renew a run's lease
- POST /api/agents/runners/runs/{runId}/start — Report that a run started
- POST /api/agents/runners/workspaces — Report a runner's working directories
- POST /api/agents/runners/{runnerId}/quota/clear — Clear a runtime quota mark
- POST /api/agents/runners/{runnerId}/revoke — Revoke a runner
- POST /api/agents/runs/current/conversation/askOwner — Ask the owner of the token's conversation something
- POST /api/agents/runs/{runId}/cancel — Cancel a run
- POST /api/agents/runs/{runId}/retry — Retry a run
- POST /api/agents/services — Create a model service
- POST /api/agents/skills — Create a skill
- POST /api/agents/skills/import — Import a skill
- POST /api/agents/skills/uploads — Upload a skill file or archive
- POST /api/agents/skills/{skillId}/versions/{version}/restore — Restore a skill version
- POST /api/agents/variables/{scopeKind}/{scopeId}/reveal — Reveal a scope's variable values
- POST /api/agents/workspaces/{subjectKind}/{subjectId}/reset — Reset the working directory of a subject
- PUT /api/agents/prices — Replace the model prices
- PUT /api/agents/skillAttachments/{scopeKind}/{scopeId} — Replace a scope's default skills
- PUT /api/agents/variables/{scopeKind}/{scopeId}/{variableName} — Set a variable

## ApiKeys

- DELETE /api/apiKeys/{keyId} — Revoke an API key
- GET /api/apiKeys — List my API keys
- GET /api/apiKeys/scopeObjects/{group} — List the records a scope group may be limited to
- GET /api/apiKeys/scopeOptions — List what a scoped key may be limited to
- POST /api/apiKeys — Create an API key
- POST /api/apiKeys/{keyId}/rotate — Rotate an API key

## App

- GET /api/healthz — Check that the application is up

## Authentication

- GET /api/auth/account-info — Get the account info provided by the provider
- GET /api/auth/api-key/get — Retrieve an existing API key by ID
- GET /api/auth/api-key/list — List all API keys for the authenticated user or for a specific organization
- GET /api/auth/device — Verify user code and get device authorization status
- GET /api/auth/get-session — Get the current session
- GET /api/auth/list-accounts — List all accounts linked to the user
- GET /api/auth/list-sessions — List all active sessions for the user
- GET /api/auth/ok — Check if the API is working
- GET /api/authentication/capabilities — Read public authentication capabilities
- POST /api/auth/api-key/create — Create a new API key for a user
- POST /api/auth/api-key/delete — Delete an existing API key
- POST /api/auth/api-key/update — Update an existing API key by ID
- POST /api/auth/change-email — Change email
- POST /api/auth/change-password — Change the password of the user
- POST /api/auth/delete-user — Delete the user
- POST /api/auth/device/approve — Approve device authorization
- POST /api/auth/device/code — Request a device and user code

Follow [rfc8628#section-3.2](https://datatracker.ietf.org/doc/html/rfc8628#section-3.2)

- POST /api/auth/device/deny — Deny device authorization
- POST /api/auth/device/token — Exchange device code for access token

Follow [rfc8628#section-3.4](https://datatracker.ietf.org/doc/html/rfc8628#section-3.4)

- POST /api/auth/get-access-token — Get a valid access token, doing a refresh if needed
- POST /api/auth/get-session — Get the current session
- POST /api/auth/is-username-available — Is username available
- POST /api/auth/refresh-token — Refresh the access token using a refresh token
- POST /api/auth/request-password-reset — Send a password reset email to the user
- POST /api/auth/reset-password — Reset the password for a user
- POST /api/auth/revoke-other-sessions — Revoke all other sessions for the user except the current one
- POST /api/auth/revoke-session — Revoke a single session
- POST /api/auth/revoke-sessions — Revoke all sessions for the user
- POST /api/auth/send-verification-email — Send a verification email to the user
- POST /api/auth/sign-in/email — Sign in with email and password
- POST /api/auth/sign-in/username — Sign in with username
- POST /api/auth/sign-out — Sign out the current user
- POST /api/auth/sign-up/email — Sign up a user using email and password
- POST /api/auth/unlink-account — Unlink an account
- POST /api/auth/update-session — Update the current session
- POST /api/auth/update-user — Update the current user
- POST /api/auth/verify-password — Verify the current user's password

## Authorization

- DELETE /api/authorization/defaultAccess/{key} — Delete a default-access rule
- DELETE /api/authorization/permissionSets/{key} — Delete a Permission Set
- DELETE /api/authorization/permissionSets/{key}/assignments/{assignmentId} — Revoke an assignment of a Permission Set
- DELETE /api/authorization/restrictionRules/{key} — Delete a restriction rule
- DELETE /api/authorization/sharingRules/{key} — Delete a sharing rule
- GET /api/authorization/defaultAccess — List default-access rules
- GET /api/authorization/defaultAccess/options — List what a default access rule can target
- GET /api/authorization/defaultAccess/records/{collection} — List a collection's records for the default access rule record picker
- GET /api/authorization/defaultAccess/subjects/{type} — List the subjects of one type for default access rule settings
- GET /api/authorization/inspector/configuredAccess — Summarize a subject's configured access
- GET /api/authorization/inspector/options — List what the permission inspector can check
- GET /api/authorization/inspector/subjects/{type} — List the subjects of one type for inspector settings
- GET /api/authorization/permissionSets — List Permission Sets
- GET /api/authorization/permissionSets/options — List what a Permission Set can grant
- GET /api/authorization/permissionSets/subjects/{type} — List the subjects of one type for permission set settings
- GET /api/authorization/permissionSets/{key} — Get a Permission Set
- GET /api/authorization/permissionSets/{key}/assignments — List the assignments of a Permission Set
- GET /api/authorization/permissions — Get the signed-in user's permissions
- GET /api/authorization/restrictionRules — List restriction rules
- GET /api/authorization/restrictionRules/options — List what a restriction rule can target
- GET /api/authorization/restrictionRules/records/{collection} — List a collection's records for the restriction rule record picker
- GET /api/authorization/restrictionRules/subjects/{type} — List the subjects of one type for restriction rule settings
- GET /api/authorization/sharingRules — List sharing rules
- GET /api/authorization/sharingRules/options — List what a sharing rule can target
- GET /api/authorization/sharingRules/records/{collection} — List a collection's records for the sharing rule record picker
- GET /api/authorization/sharingRules/subjects/{type} — List the subjects of one type for sharing rule settings
- PATCH /api/authorization/defaultAccess/{key} — Update a default-access rule
- PATCH /api/authorization/permissionSets/{key} — Update a Permission Set
- PATCH /api/authorization/restrictionRules/{key} — Update a restriction rule
- PATCH /api/authorization/sharingRules/{key} — Update a sharing rule
- POST /api/authorization/defaultAccess — Create a default-access rule
- POST /api/authorization/defaultAccess/subjects/{type}/resolve — Resolve subjects by id for default access rule settings
- POST /api/authorization/inspector/batchDecide — Decide up to 100 actions for a subject
- POST /api/authorization/inspector/decide — Decide one action for a subject
- POST /api/authorization/inspector/subjects/{type}/resolve — Resolve subjects by id for inspector settings
- POST /api/authorization/permissionSets — Create a Permission Set
- POST /api/authorization/permissionSets/subjects/{type}/resolve — Resolve subjects by id for permission set settings
- POST /api/authorization/permissionSets/{key}/assignments — Assign a Permission Set to a subject
- POST /api/authorization/restrictionRules — Create a restriction rule
- POST /api/authorization/restrictionRules/subjects/{type}/resolve — Resolve subjects by id for restriction rule settings
- POST /api/authorization/sharingRules — Create a sharing rule
- POST /api/authorization/sharingRules/subjects/{type}/resolve — Resolve subjects by id for sharing rule settings

## Cli

- GET /api/cli/manifest — Get the command-line manifest

## DatabaseExplorer

- GET /api/databaseExplorer/connections — List the configured database connections
- GET /api/databaseExplorer/connections/{connection}/collections — List the Collections of a connection
- GET /api/databaseExplorer/connections/{connection}/collections/{collection} — Get the resolved definition of a Collection
- GET /api/databaseExplorer/connections/{connection}/collections/{collection}/physicalSchema — Get the physical schema behind a Collection

## Demo mode

- GET /api/demoMode/data — Get the demo data status
- GET /api/demoMode/models/v1/models — List the simulated models
- GET /api/demoMode/status — Read whether the application is a demo
- POST /api/demoMode/data/clear — Clear the demo data
- POST /api/demoMode/data/import — Generate demo data
- POST /api/demoMode/data/reset — Reset the demo data
- POST /api/demoMode/models/v1/chat/completions — Answer a chat completion with the simulated model

## DemoMode

- GET /api/demoMode/accounts — List the system accounts visitors may enter
- GET /api/demoMode/configuration — Read demo configuration and registered adapters
- GET /api/demoMode/configuration/collections — List selectable collections in the default database
- POST /api/demoMode/accounts/signInDefault — Enter the demo as Super Admin
- POST /api/demoMode/accounts/{username}/signIn — Sign in as a system account in Demo Mode
- PUT /api/demoMode/configuration/chat — Configure demo chat
- PUT /api/demoMode/configuration/collections — Configure demo collections
- PUT /api/demoMode/configuration/mocks — Configure demo mocks

## I18n

- GET /api/i18n/locales — List the languages the server answers in

## Knowledge

- GET /api/knowledge/capabilities — Get the knowledge base capabilities
- GET /api/knowledge/chunking — Get how a space is cut into sections
- GET /api/knowledge/docs/{docId} — Get a document at its current version
- GET /api/knowledge/docs/{docId}/access — Get the caller's access to a document
- GET /api/knowledge/docs/{docId}/file — Download the file of a file entry
- GET /api/knowledge/docs/{docId}/index — Get a document’s sections and their index state
- GET /api/knowledge/docs/{docId}/permissions — Get who may do what on a document
- GET /api/knowledge/docs/{docId}/versions — List the versions of a document
- GET /api/knowledge/docs/{docId}/versions/{version} — Get one version of a document
- GET /api/knowledge/embeddingModels — List embedding models available to Knowledge
- GET /api/knowledge/indexing — List the documents of a space not yet semantically indexed
- GET /api/knowledge/indexingInstances — List configured Knowledge index instances
- GET /api/knowledge/indexingSettings — Read global Knowledge index settings
- GET /api/knowledge/indexingSettings/status — Read global Knowledge index progress
- GET /api/knowledge/search — Search readable knowledge sections
- GET /api/knowledge/spaces — List a space and the spaces it inherits, with their documents
- GET /api/knowledge/subjects — Search the subjects access can be granted to
- PATCH /api/knowledge/docs/{docId} — Save a new version of a document
- POST /api/knowledge/docs — Create an article or a folder
- POST /api/knowledge/docs/upload — Upload a file as a new document
- POST /api/knowledge/docs/{docId}/archive — Archive a document
- POST /api/knowledge/docs/{docId}/move — Move a document
- POST /api/knowledge/docs/{docId}/reindex — Index a document’s sections again
- POST /api/knowledge/docs/{docId}/reparse — Extract the text of a file again
- POST /api/knowledge/docs/{docId}/replaceFile — Replace the file of a file entry
- POST /api/knowledge/docs/{docId}/restore — Restore an archived document
- POST /api/knowledge/docs/{docId}/verify — Mark a document verified
- POST /api/knowledge/indexingSettings/rebuild — Rebuild the Knowledge index across all spaces
- POST /api/knowledge/indexingSettings/retry — Retry failed work in the current Knowledge index
- PUT /api/knowledge/chunking — Set how a space is cut into sections
- PUT /api/knowledge/docs/{docId}/permissions — Replace who may do what on a document
- PUT /api/knowledge/indexingSettings — Replace global Knowledge index settings

## Notification

- GET /api/notifications/logs — List notification logs
- GET /api/notifications/logs/{logId} — Get a notification log

## NotificationInApp

- DELETE /api/notificationInApp/messages/{messageId} — Delete a message from the inbox
- GET /api/notificationInApp/messages — List the messages in the inbox
- GET /api/notificationInApp/messages/unreadCount — Count the unread messages in the inbox
- POST /api/notificationInApp/messages/markAllRead — Mark every message in the inbox read
- POST /api/notificationInApp/messages/{messageId}/markRead — Mark a message read
- POST /api/notificationInApp/messages/{messageId}/markUnread — Mark a message unread

## Projects

- DELETE /api/projects/attachments/{attachmentId} — Delete a file
- DELETE /api/projects/comments/{commentId} — Delete a comment
- DELETE /api/projects/intake/files/{fileId} — Delete an intake file
- DELETE /api/projects/invitations/{invitationId} — Revoke an invitation
- DELETE /api/projects/issues/{issueId} — Delete an issue
- DELETE /api/projects/issues/{issueId}/dependencies/{dependencyId} — Remove a dependency by its id
- DELETE /api/projects/labels/{labelId} — Delete a label
- DELETE /api/projects/{projectId} — Delete a project
- DELETE /api/projects/{projectId}/members/{userId} — Remove a project member
- DELETE /api/projects/{projectId}/resources/{resourceId} — Remove a project’s repository
- GET /api/projects — List projects
- GET /api/projects/apiKeyActors — List API key identities
- GET /api/projects/attachments/{attachmentId} — Get a file
- GET /api/projects/attachments/{attachmentId}/content — Download a file
- GET /api/projects/executors — List executors of other kinds
- GET /api/projects/intake/aiAvailability — Check whether the caller can ask AI for drafts
- GET /api/projects/intake/aiJobs/{jobId} — Get an AI draft job
- GET /api/projects/invitations — List pending and expired invitations
- GET /api/projects/issues — List issues
- GET /api/projects/issues/board — Get the issue board
- GET /api/projects/issues/statuses — List the statuses issues may have
- GET /api/projects/issues/summaries — Read issue summaries in a batch
- GET /api/projects/issues/{issueId} — Get an issue
- GET /api/projects/issues/{issueId}/activities — List an issue’s activities
- GET /api/projects/issues/{issueId}/attachments — List an issue’s files
- GET /api/projects/issues/{issueId}/comments — List an issue’s comment threads
- GET /api/projects/issues/{issueId}/screenshots — List the latest issue screenshots
- GET /api/projects/labels — List labels
- GET /api/projects/me — Get the signed-in user and their permissions
- GET /api/projects/members — List members
- GET /api/projects/mentionCandidates — List mention candidates
- GET /api/projects/plans — List plans
- GET /api/projects/plans/{planId} — Get a plan
- GET /api/projects/settings — Get the workspace settings
- GET /api/projects/{projectId} — Get a project
- PATCH /api/projects/comments/{commentId} — Edit a comment
- PATCH /api/projects/issues/{issueId} — Update an issue
- PATCH /api/projects/issues/{issueId}/dependencies/{dependencyId} — Change an issue relationship type
- PATCH /api/projects/labels/{labelId} — Update a label
- PATCH /api/projects/plans/{planId} — Edit a plan
- PATCH /api/projects/settings — Update the workspace settings
- PATCH /api/projects/{projectId} — Update a project
- PATCH /api/projects/{projectId}/resources/{resourceId} — Update a project’s repository
- POST /api/projects — Create a project
- POST /api/projects/attachments — Upload a file
- POST /api/projects/comments/{commentId}/react — React to a comment
- POST /api/projects/comments/{commentId}/resolve — Resolve a comment thread
- POST /api/projects/comments/{commentId}/unreact — Remove a reaction from a comment
- POST /api/projects/comments/{commentId}/unresolve — Reopen a resolved comment thread
- POST /api/projects/intake/aiJobs — Ask AI to split, revise or break down drafts
- POST /api/projects/intake/aiJobs/{jobId}/cancel — Cancel an AI draft job
- POST /api/projects/intake/extractTexts — Extract the text of intake files
- POST /api/projects/intake/files — Upload an intake file
- POST /api/projects/intake/split — Split text and files into draft issues
- POST /api/projects/invitations — Invite people
- POST /api/projects/invitations/{invitationId}/resend — Send an invitation again
- POST /api/projects/issues — Create an issue
- POST /api/projects/issues/{issueId}/attachments — Attach a file to an issue
- POST /api/projects/issues/{issueId}/comments — Comment on an issue
- POST /api/projects/issues/{issueId}/dependencies — Add a dependency to an issue
- POST /api/projects/issues/{issueId}/removeDependency — Remove a dependency by the other issue
- POST /api/projects/issues/{issueId}/restore — Restore a deleted issue
- POST /api/projects/issues/{issueId}/subscribe — Subscribe to an issue's notifications
- POST /api/projects/issues/{issueId}/unsubscribe — Unsubscribe from an issue's notifications
- POST /api/projects/labels — Create a label
- POST /api/projects/plans — Propose a plan
- POST /api/projects/plans/rehearse — Rehearse a plan without storing it
- POST /api/projects/plans/{planId}/execute — Execute a plan
- POST /api/projects/plans/{planId}/retry — Rehearse a failed or stale plan again
- POST /api/projects/plans/{planId}/undo — Undo an executed plan
- POST /api/projects/plans/{planId}/void — Void a plan
- POST /api/projects/{projectId}/members — Add a project member
- POST /api/projects/{projectId}/resources — Add a repository to a project

## Push

- POST /api/push/acknowledge — Let this device’s foreground page handle a reminder

## Releases

- DELETE /api/releases/apps/{appId} — Delete an app
- DELETE /api/releases/apps/{appId}/variables/{name} — Remove an app's variable
- DELETE /api/releases/environments/{environmentId} — Delete an environment
- DELETE /api/releases/environments/{environmentId}/variables/{name} — Remove an environment's variable
- DELETE /api/releases/registries/{registryId} — Delete an image registry
- GET /api/releases/apps — List apps
- GET /api/releases/apps/{appId} — Get an app
- GET /api/releases/apps/{appId}/config — Read an app's configuration
- GET /api/releases/apps/{appId}/deployments — List an app's deployments
- GET /api/releases/apps/{appId}/deployments/{deploymentId} — Get a deployment
- GET /api/releases/apps/{appId}/deployments/{deploymentId}/logs — Read a deployment's logs
- GET /api/releases/apps/{appId}/initialAdmin — Read an app's generated first administrator
- GET /api/releases/apps/{appId}/logs — Read an app's runtime logs
- GET /api/releases/apps/{appId}/releases — List an app's releases
- GET /api/releases/apps/{appId}/releases/{releaseId} — Get a release
- GET /api/releases/apps/{appId}/releases/{releaseId}/archive — Download a release's archive
- GET /api/releases/apps/{appId}/releases/{releaseId}/configTemplate — Read a release's configuration template
- GET /api/releases/apps/{appId}/releases/{releaseId}/variables — Read a release's variables manifest
- GET /api/releases/apps/{appId}/variables — List an app's variables
- GET /api/releases/deploymentRequests — List deployment requests
- GET /api/releases/deploymentRequests/{requestId} — Get a deployment request
- GET /api/releases/drivers — List deployment drivers
- GET /api/releases/environments — List environments
- GET /api/releases/environments/{environmentId} — Get an environment
- GET /api/releases/environments/{environmentId}/declaredVariables — List the variables an environment's Apps declare
- GET /api/releases/environments/{environmentId}/variables — List an environment's variables
- GET /api/releases/me — Get the caller and their release permissions
- GET /api/releases/registries — List image registries
- GET /api/releases/registries/{registryId} — Get an image registry
- PATCH /api/releases/apps/{appId} — Update an app
- PATCH /api/releases/apps/{appId}/releases/{releaseId} — Replace a release's labels
- PATCH /api/releases/environments/{environmentId} — Update an environment
- PATCH /api/releases/registries/{registryId} — Update an image registry
- POST /api/releases/apps — Create an app
- POST /api/releases/apps/{appId}/deploy — Deploy a release
- POST /api/releases/apps/{appId}/deploymentRequests — Request a deployment
- POST /api/releases/apps/{appId}/imageReleases — Register an image release
- POST /api/releases/apps/{appId}/initialAdmin/dismiss — Forget an app's generated first administrator
- POST /api/releases/apps/{appId}/releases — Upload a release
- POST /api/releases/apps/{appId}/releases/{releaseId}/promote — Promote a release to another app
- POST /api/releases/apps/{appId}/restart — Restart an app
- POST /api/releases/apps/{appId}/rollback — Roll an app back
- POST /api/releases/apps/{appId}/start — Start an app
- POST /api/releases/apps/{appId}/stop — Stop an app
- POST /api/releases/apps/{appId}/uploadTickets — Create an upload ticket
- POST /api/releases/deploymentRequests/{requestId}/approve — Approve a deployment request
- POST /api/releases/deploymentRequests/{requestId}/cancel — Cancel a deployment request
- POST /api/releases/deploymentRequests/{requestId}/reject — Reject a deployment request
- POST /api/releases/environments — Create an environment
- POST /api/releases/environments/check — Check unsaved environment settings
- POST /api/releases/environments/{environmentId}/check — Check an environment
- POST /api/releases/registries — Create an image registry
- POST /api/releases/registries/check — Check unsaved registry settings
- POST /api/releases/registries/{registryId}/check — Check an image registry
- PUT /api/releases/apps/{appId}/config — Replace an app's configuration
- PUT /api/releases/apps/{appId}/variables/{name} — Set an app's variable
- PUT /api/releases/environments/{environmentId}/variables/{name} — Set an environment's variable

## Scheduler

- GET /api/scheduler/schedules — List Schedules
- GET /api/scheduler/schedules/{scheduleId} — Get a Schedule
- GET /api/scheduler/schedules/{scheduleId}/occurrences — List the occurrences of a Schedule
- POST /api/scheduler/schedules/{scheduleId}/disable — Disable a Schedule
- POST /api/scheduler/schedules/{scheduleId}/enable — Enable a Schedule

## Studio

- DELETE /api/access/roles/{roleKey} — Delete a role
- DELETE /api/git/authorizations/{connectionId} — Forget the caller’s authorization
- DELETE /api/git/connections/{connectionId} — Remove a connection to a code host
- DELETE /api/git/pullRequests/{pullRequestId} — Unlink a pull request from an issue
- DELETE /api/git/pullRequests/{pullRequestId}/suggestion — Dismiss a suggested pull request
- DELETE /api/organizationKeys/{keyId} — Delete an organization API key
- DELETE /api/repositoryDeployments/{resourceId}/ci/apps/{appId} — Remove an App from a repository’s CI list
- GET /api/access/catalog — Get what a role can hold
- GET /api/access/me — Get the caller’s own roles
- GET /api/access/members — List the members with their roles
- GET /api/access/roles — List the roles
- GET /api/access/roles/{roleKey} — Get a role
- GET /api/access/settings — Get the access settings
- GET /api/agentBoard — Get the Agent queue
- GET /api/agentBoard/issues/{issueId}/agents/{agentId}/wait — Get why an agent’s queued run on an issue waits
- GET /api/agentSessions/sessions/{sessionId}/context — Read the current project selected for a My Agent session
- GET /api/attention — List what waits on the caller
- GET /api/delegations — List the issues a conversation delegated
- GET /api/delegations/{delegationId} — Get a delegation
- GET /api/deploys/apps/{id}/versionSummary — Read a test app commit and changes since its release baseline
- GET /api/deploys/deploymentRecords — List deployment records
- GET /api/deploys/environments — List test environments
- GET /api/deploys/hubCounts — Count the release hub’s tabs
- GET /api/deploys/marks — Read the deployment marks of issues
- GET /api/deploys/pendingVersionTasks — List tasks with merged pull requests awaiting a release tag
- GET /api/deploys/pipelines — List the projects’ release pipelines
- GET /api/deploys/projects/{projectId}/environments — Read what runs on a project’s environments
- GET /api/deploys/projects/{projectId}/unreleasedIssues — List a project’s unreleased issues
- GET /api/deploys/releaseLines/{id} — Read confirmed release lines and saved suggestions for a repository resource
- GET /api/deploys/releaseLines/{id}/publishTarget — Resolve a release target and compare pending tasks without storing a snapshot
- GET /api/deploys/releaseLines/{id}/tags — Read at most 100 recent tags without storing suggestions
- GET /api/deploys/releases — List the releases of projects’ apps
- GET /api/deploys/releases/{releaseId} — Read a release
- GET /api/deploys/unreleasedTasks — List finished issues not in production
- GET /api/deploys/versionEnvironments — Read saved test environment containment summaries
- GET /api/deploys/versionPipelines — Summarize release progress by project
- GET /api/deploys/versionProgress — Read release progress for up to 100 tasks
- GET /api/deploys/versions — List published repository tags
- GET /api/deploys/versions/{id} — Read a tag version and its counts
- GET /api/deploys/versions/{id}/artifacts — List artifacts built from this tag commit
- GET /api/deploys/versions/{id}/deployments — List recorded deployments of this version
- GET /api/deploys/versions/{id}/tasks — List the tasks added on this release line
- GET /api/followUps — Get my follow-ups
- GET /api/followUps/following — Get the issues I follow
- GET /api/followUps/issues — List my follow-ups rows of some issues
- GET /api/git/authorizations — List the caller’s own authorizations on code hosts
- GET /api/git/commitChecks — Read live checks of a commit without a pull request
- GET /api/git/connections — List the connections to code hosts
- GET /api/git/connections/{connectionId}/reach — Count the repositories a connection reaches
- GET /api/git/connections/{connectionId}/repositories — List the repositories a connection reaches
- GET /api/git/connections/{connectionId}/usage — List the repositories linked through a connection
- GET /api/git/marks — Read the pull request marks of issues
- GET /api/git/projects/{projectId} — Read a project’s git settings
- GET /api/git/projects/{projectId}/repositoryCards — List a project’s repository cards
- GET /api/git/pullRequests — List an issue’s pull requests
- GET /api/git/pullRequests/{pullRequestId}/checks — List the failed checks of a pull request’s head
- GET /api/git/resources/{resourceId} — Read a repository’s settings
- GET /api/git/resources/{resourceId}/reportedChecks — Read the checks a repository’s reporter reported last
- GET /api/git/status — Read whether git is set up
- GET /api/inbox/items — List the caller’s inbox
- GET /api/inbox/notices — List what Studio knows about the caller’s inbox items
- GET /api/inbox/pending — Count inbox approvals and unread notifications
- GET /api/inbox/unreadCount — Count unread inbox notifications
- GET /api/inbox/waiting — List the decisions waiting on the caller
- GET /api/issueCommentRuns/{issueId} — Get an agent comment held back by the comment run limit
- GET /api/issueOwnerHandoffs/{issueId} — Get an issue owner handoff
- GET /api/issuePanels/{issueId} — Read authorized task panel snapshots
- GET /api/issueProgress/{issueId} — Get what an issue waits for
- GET /api/issueRuns — List an issue's agent runs
- GET /api/issueRuns/{runId} — Get an agent run on an issue
- GET /api/issueRuns/{runId}/events — Read an agent run's transcript on an issue
- GET /api/kb/docs — List the knowledge documents
- GET /api/kb/docs/{doc} — Read a knowledge document
- GET /api/kb/docs/{doc}/file — Download a knowledge file
- GET /api/kb/offers — List a task’s knowledge suggestions
- GET /api/kb/search — Search the knowledge
- GET /api/kb/tree — Get the knowledge documents as a tree
- GET /api/knowledgeDirectory — List authorized knowledge spaces and document counts
- GET /api/knowledgeDirectory/search — Search all authorized knowledge spaces
- GET /api/organizationKeys — List the organization’s API keys
- GET /api/organizationKeys/scopeOptions — Get the permission groups a key may be given
- GET /api/organizationKeys/{keyId} — Get an organization API key
- GET /api/organizationKeys/{keyId}/events — List what happened to an organization API key
- GET /api/previews — List previews
- GET /api/previews/logs — Read a preview App’s log
- GET /api/previews/status — Read an issue’s previews
- GET /api/projectDefaultSkills — Get the default skills for new projects
- GET /api/projectManager — Get the project manager
- GET /api/projectMemory — List the projects’ repositories with project memory
- GET /api/projectMemory/{projectId}/repos/{repoId} — Read a repository’s project memory
- GET /api/projectMemory/{projectId}/repos/{repoId}/file — Read one memory
- GET /api/projectSetups/{projectId} — Read a project’s initialization
- GET /api/releaseDownloads/{token} — Download a release’s archive by its link
- GET /api/reports/agents — Get the agents' performance
- GET /api/reports/attention — Get what needs attention
- GET /api/reports/delivery — Get the dashboard delivery figures
- GET /api/reports/metrics — Get the acceptance metrics
- GET /api/reports/projects — Get the projects' progress
- GET /api/reports/usage — Get what agents’ runs used and cost
- GET /api/repositoryDeployments — List the repositories that build an App
- GET /api/repositoryDeployments/apps/{appId}/usage — Read what deleting an App stops
- GET /api/repositoryDeployments/ciWorkflows/environments — List the environments CI may deploy to
- GET /api/repositoryDeployments/{resourceId} — Read the Apps a repository builds
- GET /api/repositoryDeployments/{resourceId}/builds — List the builds CI reported for a repository
- GET /api/repositoryDeployments/{resourceId}/ci — Read how a repository’s CI is set up
- GET /api/repositoryDeployments/{resourceId}/ci/connection — Read where a repository’s CI stands
- GET /api/repositoryDeployments/{resourceId}/ciWorkflow — Generate the CI file building a repository’s Apps
- GET /api/taskGroups — Read the grouped tasks of an issue list
- GET /api/taskGroups/children — Read the children of tasks in the grouped table
- GET /api/taskGroups/rows — Read single tasks as an issue list groups them now
- GET /api/taskGroups/summary — Count the tasks the caller owns or executes
- GET /api/taskGroups/{issueId}/decisions — Read the caller’s waiting decisions on a task
- PATCH /api/access/members/{userId} — Replace a member’s roles
- PATCH /api/access/roles/{roleKey} — Update a role
- PATCH /api/delegations/{delegationId} — Stop or resume following a delegation
- PATCH /api/git/connections/{connectionId} — Update a connection to a code host
- PATCH /api/git/pullRequests/{pullRequestId} — Update an issue’s pull request link
- PATCH /api/git/resources/{resourceId} — Update a repository’s settings
- PATCH /api/organizationKeys/{keyId} — Update an organization API key’s name or description
- PATCH /api/projectManager — Update the project manager
- POST /api/access/roles — Create a role
- POST /api/agentBoard/issueWork — Get current agent work on visible issues
- POST /api/agentBoard/issues/{issueId}/start — Start the agent’s work on an idle issue
- POST /api/builds/apps/{appId}/ensure — Make sure of an App in an environment
- POST /api/builds/deploy — Deploy an archive or a release to an App
- POST /api/builds/report — Report where CI stands with a build
- POST /api/builds/uploadTickets — Create an upload ticket for a build’s archive
- POST /api/builds/{buildId}/uploadArtifact — Upload a build’s archive
- POST /api/deploys/deploymentRecords — Record a deployment without changing release status
- POST /api/deploys/productionMarks — Mark a release as deployed to production
- POST /api/deploys/releases/{releaseId}/downloadLink — Make a download link for a release’s archive
- POST /api/deploys/reopenSuggestions/{appId}/decide — Answer a suggestion to reopen issues
- POST /api/deploys/versionArtifacts — Associate an existing artifact with its repository commit
- POST /api/failedRuns/confirmHandoff — Confirm a manager handoff of a failed step
- POST /api/failedRuns/{runId}/decide — Decide a failed run’s card
- POST /api/failedRuns/{runId}/dispatch — Dispatch a replacement for a failed step
- POST /api/followUps/issues/{issueId}/follow — Follow an issue in my follow-ups
- POST /api/followUps/issues/{issueId}/markSeen — Mark an issue seen in my follow-ups
- POST /api/followUps/issues/{issueId}/unfollow — Stop following an issue in my follow-ups
- POST /api/git/authorizations/{connectionId}/authorize — Start authorizing a connection’s app (OAuth)
- POST /api/git/authorizations/{connectionId}/pollDeviceFlow — Poll a device flow authorization
- POST /api/git/authorizations/{connectionId}/startDeviceFlow — Start a device flow authorization
- POST /api/git/authorizations/{connectionId}/useToken — Authorize with a personal access token
- POST /api/git/checks — Report a check of a commit
- POST /api/git/connections — Add a connection to a code host
- POST /api/git/connections/startAppManifest — Start creating an app on the code host from a manifest
- POST /api/git/connections/{connectionId}/repositories — Create a repository on the code host
- POST /api/git/pullRequests — Link a pull request to an issue
- POST /api/git/pullRequests/{pullRequestId}/checkMerge — Check whether a pull request can be merged
- POST /api/git/pullRequests/{pullRequestId}/markMerged — Record a pull request as merged
- POST /api/git/pullRequests/{pullRequestId}/merge — Merge a pull request
- POST /api/git/pullRequests/{pullRequestId}/refresh — Read a pull request from the code host now
- POST /api/git/resources/{resourceId}/repairWebhook — Recreate a repository’s webhook
- POST /api/inbox/reconcile — Reconcile obsolete decisions on finished issues
- POST /api/intakeDrafts — Hand back an intake request’s issue drafts
- POST /api/issueCommentRuns/{issueId}/continue — Continue an agent comment held back by the comment run limit
- POST /api/issueOwnerHandoffs/{issueId}/accept — Accept an issue owner handoff
- POST /api/issueOwnerHandoffs/{issueId}/reject — Reject an issue owner handoff
- POST /api/issues/{issueId}/sendBack — Send an issue back with a reason
- POST /api/kb/offers — Suggest saving a task file to knowledge
- POST /api/kb/offers/{offerId}/accept — Save an offered task file
- POST /api/kb/offers/{offerId}/reject — Decline saving a task file
- POST /api/organizationKeys — Create an organization API key
- POST /api/organizationKeys/{keyId}/disable — Disable an organization API key
- POST /api/organizationKeys/{keyId}/enable — Enable an organization API key
- POST /api/organizationKeys/{keyId}/rotate — Rotate an organization API key’s secret
- POST /api/previews/down — Destroy an issue’s previews
- POST /api/previews/preference — Set whether an issue needs a preview
- POST /api/previews/retry — Deploy a preview again
- POST /api/previews/variables — Save what a blocked preview misses
- POST /api/projectManager/issues/{issueId}/start — Hand an issue to the project manager
- POST /api/projectSetups — Create a project with its repository
- POST /api/projects/{projectId}/codeLocations — Add a repository to a project
- POST /api/repositoryDeployments/ciWorkflows/generate — Generate the standard CI file of an application
- POST /api/repositoryDeployments/{resourceId}/ci/rotate — Rotate a repository’s CI key
- POST /api/repositoryDeployments/{resourceId}/ci/setup — Make a repository’s CI key
- POST /api/repositoryDeployments/{resourceId}/testApps — Create and link a test App
- POST /api/webhooks/{provider}/connections/{connectionId} — Receive a connection’s webhook delivery
- POST /api/webhooks/{provider}/repositories/{repositoryId} — Receive a repository webhook delivery
- PUT /api/access/settings — Replace the access settings
- PUT /api/deploys/releaseLines/{id} — Confirm release lines and establish their latest tag baselines
- PUT /api/followUps/following — Replace the issues I follow
- PUT /api/git/projects/{projectId} — Replace a project’s git settings
- PUT /api/organizationKeys/{keyId}/scope — Replace an organization API key’s permissions
- PUT /api/projectDefaultSkills — Set the default skills for new projects
- PUT /api/repositoryDeployments/{resourceId} — Replace the Apps a repository builds

## Users

- DELETE /api/users/invitations/{invitationId} — Revoke an invitation
- DELETE /api/users/me/preferences/{key} — Remove one of my preferences
- DELETE /api/users/{userId} — Delete a user
- GET /api/users — List users
- GET /api/users/invitations — List pending and expired invitations
- GET /api/users/me/preferences — List my preferences
- GET /api/users/options — List the role scopes and roles a user can be assigned
- GET /api/users/{userId} — Get a user
- PATCH /api/users/me/preferences — Set several of my preferences
- PATCH /api/users/{userId} — Update a user
- POST /api/users — Create a user
- POST /api/users/invitations — Invite people by email
- POST /api/users/invitations/accept — Accept an invitation
- POST /api/users/invitations/lookup — Look up an invitation by its token
- POST /api/users/invitations/{invitationId}/resend — Send an invitation again
- POST /api/users/{userId}/disable — Disable a user
- POST /api/users/{userId}/enable — Enable a user
- POST /api/users/{userId}/resetPassword — Reset a user's password
- POST /api/users/{userId}/revokeSessions — Sign a user out of every session
- PUT /api/users/me/preferences/{key} — Set one of my preferences
- PUT /api/users/{userId}/roleScopes/{scope} — Replace a user's roles in one role scope

## WebPush

- DELETE /api/webPush/subscriptions/{id} — Remove the caller’s device
- GET /api/webPush/key — Read the Web Push public key
- GET /api/webPush/subscriptions — List the caller’s subscribed devices
- PATCH /api/webPush/subscriptions/{id} — Enable or disable the caller’s device
- POST /api/webPush/subscriptions — Subscribe this browser for the caller
- POST /api/webPush/subscriptions/{id}/test — Send a test notification to the caller’s device

## B. Lệnh CLI (`nb-studio`) theo nhóm, kèm route và danh tính được phép (person / run)

## access (22)

- `access:catalog` — Get what a role can hold [GET /access/catalog] ids=person
- `access:me` — Get the caller’s own roles [GET /access/me] ids=person
- `access:member:list` — List the members with their roles [GET /access/members] ids=person
- `access:member:update` — Replace a member’s roles [PATCH /access/members/{userId}] ids=person
- `access:org-key:create` — Create an organization API key [POST /organizationKeys] ids=person
- `access:org-key:delete` — Delete an organization API key [DELETE /organizationKeys/{keyId}] ids=person
- `access:org-key:disable` — Disable an organization API key [POST /organizationKeys/{keyId}/disable] ids=person
- `access:org-key:enable` — Enable an organization API key [POST /organizationKeys/{keyId}/enable] ids=person
- `access:org-key:events` — List what happened to an organization API key [GET /organizationKeys/{keyId}/events] ids=person
- `access:org-key:get` — Get an organization API key [GET /organizationKeys/{keyId}] ids=person
- `access:org-key:list` — List the organization’s API keys [GET /organizationKeys] ids=person
- `access:org-key:rotate` — Rotate an organization API key’s secret [POST /organizationKeys/{keyId}/rotate] ids=person
- `access:org-key:scope-options` — Get the permission groups a key may be given [GET /organizationKeys/scopeOptions] ids=person
- `access:org-key:scope:set` — Replace an organization API key’s permissions [PUT /organizationKeys/{keyId}/scope] ids=person
- `access:org-key:update` — Update an organization API key’s name or description [PATCH /organizationKeys/{keyId}] ids=person
- `access:role:create` — Create a role [POST /access/roles] ids=person
- `access:role:delete` — Delete a role [DELETE /access/roles/{roleKey}] ids=person
- `access:role:get` — Get a role [GET /access/roles/{roleKey}] ids=person
- `access:role:list` — List the roles [GET /access/roles] ids=person
- `access:role:update` — Update a role [PATCH /access/roles/{roleKey}] ids=person
- `access:settings:get` — Get the access settings [GET /access/settings] ids=person
- `access:settings:set` — Replace the access settings [PUT /access/settings] ids=person

## agent (9)

- `agent:action:list` — List the business actions an agent may be given [GET /agents/actions] ids=person
- `agent:brief` — Preview an agent's full prompt [GET /agents/{agentId}/previewBrief] ids=person
- `agent:create` — Create an agent from an available model [POST /agents/runnerAgents] ids=person
- `agent:get` — Get an agent [GET /agents/{agentId}] ids=person
- `agent:history` — List an agent's history [GET /agents/{agentId}/history] ids=person
- `agent:list` — List the agents the caller may give work to [GET /agents/available] ids=person/run
- `agent:list-all` — List agents [GET /agents] ids=person
- `agent:model:list` — List tools, or one tool’s models, to create an agent from [GET /agents/availableModels] ids=person
- `agent:update` — Update an agent [PATCH /agents/{agentId}] ids=person

## api-key (6)

- `api-key:create` — Create an API key [POST /apiKeys] ids=person
- `api-key:delete` — Revoke an API key [DELETE /apiKeys/{keyId}] ids=person
- `api-key:list` — List my API keys [GET /apiKeys] ids=person
- `api-key:rotate` — Rotate an API key [POST /apiKeys/{keyId}/rotate] ids=person
- `api-key:scope-objects` — List the records a scope group may be limited to [GET /apiKeys/scopeObjects/{group}] ids=person
- `api-key:scope-options` — List what a scoped key may be limited to [GET /apiKeys/scopeOptions] ids=person

## app (17)

- `app:config:get` — Read an app's configuration [GET /releases/apps/{appId}/config] ids=person
- `app:config:set` — Replace an app's configuration [PUT /releases/apps/{appId}/config] ids=person
- `app:create` — Create an app [POST /releases/apps] ids=person
- `app:delete` — Delete an app [DELETE /releases/apps/{appId}] ids=person
- `app:deploy` — Deploy a release [POST /releases/apps/{appId}/deploy] ids=person/run
- `app:ensure` — Make sure of an App in an environment [POST /builds/apps/{appId}/ensure] ids=person
- `app:env:list` — List an app's variables [GET /releases/apps/{appId}/variables] ids=person/run
- `app:env:set` — Set an app's variable [PUT /releases/apps/{appId}/variables/{name}] ids=person
- `app:env:unset` — Remove an app's variable [DELETE /releases/apps/{appId}/variables/{name}] ids=person
- `app:get` — Get an app [GET /releases/apps/{appId}] ids=person/run
- `app:list` — List apps [GET /releases/apps] ids=person/run
- `app:logs` — Read an app's runtime logs [GET /releases/apps/{appId}/logs] ids=person/run
- `app:restart` — Restart an app [POST /releases/apps/{appId}/restart] ids=person
- `app:rollback` — Roll an app back [POST /releases/apps/{appId}/rollback] ids=person/run
- `app:start` — Start an app [POST /releases/apps/{appId}/start] ids=person
- `app:stop` — Stop an app [POST /releases/apps/{appId}/stop] ids=person
- `app:update` — Update an app [PATCH /releases/apps/{appId}] ids=person

## attachment (3)

- `attachment:delete` — Delete a file [DELETE /projects/attachments/{attachmentId}] ids=person/run
- `attachment:get` — Get a file [GET /projects/attachments/{attachmentId}] ids=person
- `attachment:upload` — Upload a file [POST /projects/attachments] ids=person/run

## board (5)

- `board:failed-run:decide` — Decide a failed run’s card [POST /failedRuns/{runId}/decide] ids=person
- `board:get` — Get the Agent queue [GET /agentBoard] ids=person
- `board:issue-work` — Get current agent work on visible issues [POST /agentBoard/issueWork] ids=person
- `board:start` — Start the agent’s work on an idle issue [POST /agentBoard/issues/{issueId}/start] ids=person
- `board:wait` — Get why an agent’s queued run on an issue waits [GET /agentBoard/issues/{issueId}/agents/{agentId}/wait] ids=person

## build (13)

- `build:ci:connection` — Read where a repository’s CI stands [GET /repositoryDeployments/{resourceId}/ci/connection] ids=person
- `build:ci:environments` — List the environments CI may deploy to [GET /repositoryDeployments/ciWorkflows/environments] ids=person
- `build:ci:get` — Read how a repository’s CI is set up [GET /repositoryDeployments/{resourceId}/ci] ids=person
- `build:ci:remove` — Remove an App from a repository’s CI list [DELETE /repositoryDeployments/{resourceId}/ci/apps/{appId}] ids=person
- `build:ci:rotate` — Rotate a repository’s CI key [POST /repositoryDeployments/{resourceId}/ci/rotate] ids=person
- `build:ci:setup` — Make a repository’s CI key [POST /repositoryDeployments/{resourceId}/ci/setup] ids=person
- `build:ci:workflows` — Generate the standard CI file of an application [POST /repositoryDeployments/ciWorkflows/generate] ids=person
- `build:list` — List the builds CI reported for a repository [GET /repositoryDeployments/{resourceId}/builds] ids=person
- `build:repo:get` — Read the Apps a repository builds [GET /repositoryDeployments/{resourceId}] ids=person
- `build:repo:list` — List the repositories that build an App [GET /repositoryDeployments] ids=person
- `build:repo:set` — Replace the Apps a repository builds [PUT /repositoryDeployments/{resourceId}] ids=person
- `build:status` — Report where CI stands with a build [POST /builds/report] ids=person
- `build:workflow` — Generate the CI file building a repository’s Apps [GET /repositoryDeployments/{resourceId}/ciWorkflow] ids=person

## check (1)

- `check:report` — Report a check of a commit [POST /git/checks] ids=person/run

## comment (6)

- `comment:delete` — Delete a comment [DELETE /projects/comments/{commentId}] ids=person
- `comment:react` — React to a comment [POST /projects/comments/{commentId}/react] ids=person
- `comment:resolve` — Resolve a comment thread [POST /projects/comments/{commentId}/resolve] ids=person
- `comment:unreact` — Remove a reaction from a comment [POST /projects/comments/{commentId}/unreact] ids=person
- `comment:unresolve` — Reopen a resolved comment thread [POST /projects/comments/{commentId}/unresolve] ids=person
- `comment:update` — Edit a comment [PATCH /projects/comments/{commentId}] ids=person

## commit (1)

- `commit:checks` — Read live checks of a commit without a pull request [GET /git/commitChecks] ids=person/run

## conversation (20)

- `conversation:attachment:upload` — Upload a file to send in chat [POST /agents/chatAttachments] ids=person
- `conversation:create` — Create a conversation [POST /agents/conversations] ids=person
- `conversation:delete` — Delete a conversation [DELETE /agents/conversations/{conversationId}] ids=person
- `conversation:get` — Get a conversation [GET /agents/conversations/{conversationId}] ids=person
- `conversation:link:add` — Tie a record to a conversation [POST /agents/conversations/{conversationId}/links] ids=person
- `conversation:link:list` — List a conversation's links [GET /agents/conversations/{conversationId}/links] ids=person
- `conversation:link:remove` — Untie a record from a conversation [DELETE /agents/conversations/{conversationId}/links/{linkId}] ids=person
- `conversation:list` — List the caller's conversations [GET /agents/conversations] ids=person
- `conversation:message:list` — List a conversation's messages [GET /agents/conversations/{conversationId}/messages] ids=person
- `conversation:message:queue` — Queue a message while the agent works [POST /agents/conversations/{conversationId}/queue] ids=person
- `conversation:message:send` — Send a message [POST /agents/conversations/{conversationId}/messages] ids=person
- `conversation:message:withdraw` — Withdraw a queued message [POST /agents/conversations/{conversationId}/messages/{messageId}/withdraw] ids=person
- `conversation:preferences:get` — Get the caller's chat preferences [GET /agents/chatPreferences] ids=person
- `conversation:preferences:update` — Update the caller's chat preferences [PATCH /agents/chatPreferences] ids=person
- `conversation:settings:get` — Get the team's chat settings [GET /agents/chatSettings] ids=person
- `conversation:settings:update` — Update the team's chat settings [PATCH /agents/chatSettings] ids=person
- `conversation:stop` — Stop a conversation's agent [POST /agents/conversations/{conversationId}/stop] ids=person
- `conversation:switch-runner` — Unbind a conversation from its runner [POST /agents/conversations/{conversationId}/switchRunner] ids=person
- `conversation:update` — Rename or archive a conversation [PATCH /agents/conversations/{conversationId}] ids=person
- `conversation:usage` — Get a conversation's token usage [GET /agents/conversations/{conversationId}/usage] ids=person

## delegation (3)

- `delegation:get` — Get a delegation [GET /delegations/{delegationId}] ids=person
- `delegation:list` — List the issues a conversation delegated [GET /delegations] ids=person
- `delegation:update` — Stop or resume following a delegation [PATCH /delegations/{delegationId}] ids=person

## deploy (12)

- `deploy` — Deploy an archive or a release to an App [POST /builds/deploy] ids=person/run
- `deploy:get` — Get a deployment [GET /releases/apps/{appId}/deployments/{deploymentId}] ids=person/run
- `deploy:list` — List an app's deployments [GET /releases/apps/{appId}/deployments] ids=person/run
- `deploy:logs` — Read a deployment's logs [GET /releases/apps/{appId}/deployments/{deploymentId}/logs] ids=person/run
- `deploy:reopen-suggestion:decide` — Answer a suggestion to reopen issues [POST /deploys/reopenSuggestions/{appId}/decide] ids=person
- `deploy:request` — Request a deployment [POST /releases/apps/{appId}/deploymentRequests] ids=person/run
- `deploy:request:approve` — Approve a deployment request [POST /releases/deploymentRequests/{requestId}/approve] ids=person
- `deploy:request:cancel` — Cancel a deployment request [POST /releases/deploymentRequests/{requestId}/cancel] ids=person
- `deploy:request:get` — Get a deployment request [GET /releases/deploymentRequests/{requestId}] ids=person
- `deploy:request:list` — List deployment requests [GET /releases/deploymentRequests] ids=person
- `deploy:request:reject` — Reject a deployment request [POST /releases/deploymentRequests/{requestId}/reject] ids=person
- `deploy:status` — Read what runs on a project’s environments [GET /deploys/projects/{projectId}/environments] ids=person

## env (11)

- `env:check` — Check an environment [POST /releases/environments/{environmentId}/check] ids=person
- `env:create` — Create an environment [POST /releases/environments] ids=person
- `env:delete` — Delete an environment [DELETE /releases/environments/{environmentId}] ids=person
- `env:driver:list` — List deployment drivers [GET /releases/drivers] ids=person
- `env:get` — Get an environment [GET /releases/environments/{environmentId}] ids=person/run
- `env:list` — List environments [GET /releases/environments] ids=person/run
- `env:update` — Update an environment [PATCH /releases/environments/{environmentId}] ids=person
- `env:var:declared` — List the variables an environment's Apps declare [GET /releases/environments/{environmentId}/declaredVariables] ids=person
- `env:var:list` — List an environment's variables [GET /releases/environments/{environmentId}/variables] ids=person
- `env:var:set` — Set an environment's variable [PUT /releases/environments/{environmentId}/variables/{name}] ids=person
- `env:var:unset` — Remove an environment's variable [DELETE /releases/environments/{environmentId}/variables/{name}] ids=person

## follow-up (4)

- `follow-up:follow` — Follow an issue in my follow-ups [POST /followUps/issues/{issueId}/follow] ids=person/run
- `follow-up:following` — Get the issues I follow [GET /followUps/following] ids=person/run
- `follow-up:list` — Get my follow-ups [GET /followUps] ids=person
- `follow-up:unfollow` — Stop following an issue in my follow-ups [POST /followUps/issues/{issueId}/unfollow] ids=person/run

## git (20)

- `git:authorization:delete` — Forget the caller’s authorization [DELETE /git/authorizations/{connectionId}] ids=person
- `git:authorization:list` — List the caller’s own authorizations on code hosts [GET /git/authorizations] ids=person
- `git:authorization:poll` — Poll a device flow authorization [POST /git/authorizations/{connectionId}/pollDeviceFlow] ids=person
- `git:authorization:start` — Start a device flow authorization [POST /git/authorizations/{connectionId}/startDeviceFlow] ids=person
- `git:authorization:use-token` — Authorize with a personal access token [POST /git/authorizations/{connectionId}/useToken] ids=person
- `git:connection:create` — Add a connection to a code host [POST /git/connections] ids=person
- `git:connection:delete` — Remove a connection to a code host [DELETE /git/connections/{connectionId}] ids=person
- `git:connection:list` — List the connections to code hosts [GET /git/connections] ids=person
- `git:connection:reach` — Count the repositories a connection reaches [GET /git/connections/{connectionId}/reach] ids=person
- `git:connection:update` — Update a connection to a code host [PATCH /git/connections/{connectionId}] ids=person
- `git:connection:usage` — List the repositories linked through a connection [GET /git/connections/{connectionId}/usage] ids=person
- `git:project:get` — Read a project’s git settings [GET /git/projects/{projectId}] ids=person
- `git:project:set` — Replace a project’s git settings [PUT /git/projects/{projectId}] ids=person
- `git:repo:create` — Create a repository on the code host [POST /git/connections/{connectionId}/repositories] ids=person
- `git:repo:list` — List the repositories a connection reaches [GET /git/connections/{connectionId}/repositories] ids=person
- `git:resource:get` — Read a repository’s settings [GET /git/resources/{resourceId}] ids=person
- `git:resource:repair-webhook` — Recreate a repository’s webhook [POST /git/resources/{resourceId}/repairWebhook] ids=person
- `git:resource:reported-checks` — Read the checks a repository’s reporter reported last [GET /git/resources/{resourceId}/reportedChecks] ids=person
- `git:resource:update` — Update a repository’s settings [PATCH /git/resources/{resourceId}] ids=person
- `git:status` — Read whether git is set up [GET /git/status] ids=person

## inbox (8)

- `inbox:delete` — Delete a message from the inbox [DELETE /notificationInApp/messages/{messageId}] ids=person
- `inbox:list` — List the caller’s inbox [GET /inbox/items] ids=person/run
- `inbox:mark-all-read` — Mark every message in the inbox read [POST /notificationInApp/messages/markAllRead] ids=person
- `inbox:mark-read` — Mark a message read [POST /notificationInApp/messages/{messageId}/markRead] ids=person
- `inbox:mark-unread` — Mark a message unread [POST /notificationInApp/messages/{messageId}/markUnread] ids=person
- `inbox:pending` — Count inbox approvals and unread notifications [GET /inbox/pending] ids=person
- `inbox:unread-count` — Count unread inbox notifications [GET /inbox/unreadCount] ids=person
- `inbox:waiting` — List the decisions waiting on the caller [GET /inbox/waiting] ids=person

## intake (8)

- `intake:ai:availability` — Check whether the caller can ask AI for drafts [GET /projects/intake/aiAvailability] ids=person
- `intake:ai:cancel` — Cancel an AI draft job [POST /projects/intake/aiJobs/{jobId}/cancel] ids=person
- `intake:ai:get` — Get an AI draft job [GET /projects/intake/aiJobs/{jobId}] ids=person
- `intake:ai:start` — Ask AI to split, revise or break down drafts [POST /projects/intake/aiJobs] ids=person
- `intake:extract` — Extract the text of intake files [POST /projects/intake/extractTexts] ids=person
- `intake:file:delete` — Delete an intake file [DELETE /projects/intake/files/{fileId}] ids=person
- `intake:file:upload` — Upload an intake file [POST /projects/intake/files] ids=person
- `intake:split` — Split text and files into draft issues [POST /projects/intake/split] ids=person

## issue (24)

- `issue:activity:list` — List an issue’s activities [GET /projects/issues/{issueId}/activities] ids=person
- `issue:attachment:add` — Attach a file to an issue [POST /projects/issues/{issueId}/attachments] ids=person
- `issue:attachment:download` — Download a file [GET /projects/attachments/{attachmentId}/content] ids=person/run
- `issue:attachment:list` — List an issue’s files [GET /projects/issues/{issueId}/attachments] ids=person/run
- `issue:comment:add` — Comment on an issue [POST /projects/issues/{issueId}/comments] ids=person/run
- `issue:comment:list` — List an issue’s comment threads [GET /projects/issues/{issueId}/comments] ids=person/run
- `issue:create` — Create an issue [POST /projects/issues] ids=person/run
- `issue:decisions` — Read the caller’s waiting decisions on a task [GET /taskGroups/{issueId}/decisions] ids=person
- `issue:delete` — Delete an issue [DELETE /projects/issues/{issueId}] ids=person/run
- `issue:dependency:add` — Add a dependency to an issue [POST /projects/issues/{issueId}/dependencies] ids=person/run
- `issue:dependency:remove` — Remove a dependency by the other issue [POST /projects/issues/{issueId}/removeDependency] ids=person/run
- `issue:executor:list` — List executors of other kinds [GET /projects/executors] ids=person
- `issue:get` — Get an issue [GET /projects/issues/{issueId}] ids=person/run
- `issue:handoff:accept` — Accept an issue owner handoff [POST /issueOwnerHandoffs/{issueId}/accept] ids=person
- `issue:handoff:get` — Get an issue owner handoff [GET /issueOwnerHandoffs/{issueId}] ids=person
- `issue:handoff:reject` — Reject an issue owner handoff [POST /issueOwnerHandoffs/{issueId}/reject] ids=person
- `issue:progress` — Get what an issue waits for [GET /issueProgress/{issueId}] ids=person
- `issue:restore` — Restore a deleted issue [POST /projects/issues/{issueId}/restore] ids=person/run
- `issue:runs` — List an issue's agent runs [GET /issueRuns] ids=person/run
- `issue:search` — List issues [GET /projects/issues] ids=person/run
- `issue:status:list` — List the statuses issues may have [GET /projects/issues/statuses] ids=person
- `issue:subscribe` — Subscribe to an issue's notifications [POST /projects/issues/{issueId}/subscribe] ids=person
- `issue:unsubscribe` — Unsubscribe from an issue's notifications [POST /projects/issues/{issueId}/unsubscribe] ids=person
- `issue:update` — Update an issue [PATCH /projects/issues/{issueId}] ids=person/run

## kb (24)

- `kb:chunking:get` — Get how a space is cut into sections [GET /knowledge/chunking] ids=person
- `kb:chunking:set` — Set how a space is cut into sections [PUT /knowledge/chunking] ids=person
- `kb:doc:access:get` — Get the caller's access to a document [GET /knowledge/docs/{docId}/access] ids=person
- `kb:doc:archive` — Archive a document [POST /knowledge/docs/{docId}/archive] ids=person
- `kb:doc:create` — Create an article or a folder [POST /knowledge/docs] ids=person
- `kb:doc:index` — Get a document’s sections and their index state [GET /knowledge/docs/{docId}/index] ids=person
- `kb:doc:move` — Move a document [POST /knowledge/docs/{docId}/move] ids=person
- `kb:doc:permission:get` — Get who may do what on a document [GET /knowledge/docs/{docId}/permissions] ids=person
- `kb:doc:permission:set` — Replace who may do what on a document [PUT /knowledge/docs/{docId}/permissions] ids=person
- `kb:doc:reindex` — Index a document’s sections again [POST /knowledge/docs/{docId}/reindex] ids=person
- `kb:doc:reparse` — Extract the text of a file again [POST /knowledge/docs/{docId}/reparse] ids=person
- `kb:doc:replace-file` — Replace the file of a file entry [POST /knowledge/docs/{docId}/replaceFile] ids=person
- `kb:doc:restore` — Restore an archived document [POST /knowledge/docs/{docId}/restore] ids=person
- `kb:doc:update` — Save a new version of a document [PATCH /knowledge/docs/{docId}] ids=person
- `kb:doc:upload` — Upload a file as a new document [POST /knowledge/docs/upload] ids=person
- `kb:doc:verify` — Mark a document verified [POST /knowledge/docs/{docId}/verify] ids=person
- `kb:doc:version:get` — Get one version of a document [GET /knowledge/docs/{docId}/versions/{version}] ids=person
- `kb:doc:version:list` — List the versions of a document [GET /knowledge/docs/{docId}/versions] ids=person
- `kb:download` — Download a knowledge file [GET /kb/docs/{doc}/file] ids=person/run
- `kb:list` — List the knowledge documents [GET /kb/docs] ids=person/run
- `kb:read` — Read a knowledge document [GET /kb/docs/{doc}] ids=person/run
- `kb:search` — Search the knowledge [GET /kb/search] ids=person/run
- `kb:subject:list` — Search the subjects access can be granted to [GET /knowledge/subjects] ids=person
- `kb:tree` — Get the knowledge documents as a tree [GET /kb/tree] ids=person/run

## label (4)

- `label:create` — Create a label [POST /projects/labels] ids=person
- `label:delete` — Delete a label [DELETE /projects/labels/{labelId}] ids=person
- `label:list` — List labels [GET /projects/labels] ids=person
- `label:update` — Update a label [PATCH /projects/labels/{labelId}] ids=person

## memory (3)

- `memory:get` — Read a repository’s project memory [GET /projectMemory/{projectId}/repos/{repoId}] ids=person
- `memory:list` — List the projects’ repositories with project memory [GET /projectMemory] ids=person
- `memory:read` — Read one memory [GET /projectMemory/{projectId}/repos/{repoId}/file] ids=person

## model (3)

- `model:price:get` — Get the model prices [GET /agents/prices] ids=person
- `model:price:set` — Replace the model prices [PUT /agents/prices] ids=person
- `model:usage` — Get the model usage outside runs [GET /agents/usage/models] ids=person

## plan (9)

- `plan:create` — Propose a plan [POST /projects/plans] ids=person/run
- `plan:execute` — Execute a plan [POST /projects/plans/{planId}/execute] ids=person
- `plan:get` — Get a plan [GET /projects/plans/{planId}] ids=person/run
- `plan:list` — List plans [GET /projects/plans] ids=person/run
- `plan:rehearse` — Rehearse a plan without storing it [POST /projects/plans/rehearse] ids=person
- `plan:retry` — Rehearse a failed or stale plan again [POST /projects/plans/{planId}/retry] ids=person
- `plan:undo` — Undo an executed plan [POST /projects/plans/{planId}/undo] ids=person
- `plan:update` — Edit a plan [PATCH /projects/plans/{planId}] ids=person
- `plan:void` — Void a plan [POST /projects/plans/{planId}/void] ids=person

## pr (10)

- `pr:check-merge` — Check whether a pull request can be merged [POST /git/pullRequests/{pullRequestId}/checkMerge] ids=person
- `pr:checks` — List the failed checks of a pull request’s head [GET /git/pullRequests/{pullRequestId}/checks] ids=person/run
- `pr:link` — Link a pull request to an issue [POST /git/pullRequests] ids=person/run
- `pr:list` — List an issue’s pull requests [GET /git/pullRequests] ids=person/run
- `pr:mark-merged` — Record a pull request as merged [POST /git/pullRequests/{pullRequestId}/markMerged] ids=person
- `pr:merge` — Merge a pull request [POST /git/pullRequests/{pullRequestId}/merge] ids=person
- `pr:refresh` — Read a pull request from the code host now [POST /git/pullRequests/{pullRequestId}/refresh] ids=person
- `pr:suggestion:dismiss` — Dismiss a suggested pull request [DELETE /git/pullRequests/{pullRequestId}/suggestion] ids=person
- `pr:unlink` — Unlink a pull request from an issue [DELETE /git/pullRequests/{pullRequestId}] ids=person/run
- `pr:update` — Update an issue’s pull request link [PATCH /git/pullRequests/{pullRequestId}] ids=person

## preview (6)

- `preview:down` — Destroy an issue’s previews [POST /previews/down] ids=person/run
- `preview:list` — List previews [GET /previews] ids=person/run
- `preview:logs` — Read a preview App’s log [GET /previews/logs] ids=person/run
- `preview:preference:set` — Set whether an issue needs a preview [POST /previews/preference] ids=person/run
- `preview:retry` — Deploy a preview again [POST /previews/retry] ids=person
- `preview:status` — Read an issue’s previews [GET /previews/status] ids=person/run

## project (22)

- `project:create` — Create a project [POST /projects] ids=person
- `project:default-skills:get` — Get the default skills for new projects [GET /projectDefaultSkills] ids=person
- `project:default-skills:set` — Set the default skills for new projects [PUT /projectDefaultSkills] ids=person
- `project:delete` — Delete a project [DELETE /projects/{projectId}] ids=person
- `project:get` — Get a project [GET /projects/{projectId}] ids=person/run
- `project:invitation:create` — Invite people [POST /projects/invitations] ids=person
- `project:invitation:list` — List pending and expired invitations [GET /projects/invitations] ids=person
- `project:invitation:resend` — Send an invitation again [POST /projects/invitations/{invitationId}/resend] ids=person
- `project:invitation:revoke` — Revoke an invitation [DELETE /projects/invitations/{invitationId}] ids=person
- `project:list` — List projects [GET /projects] ids=person/run
- `project:location:add` — Add a repository to a project [POST /projects/{projectId}/codeLocations] ids=person
- `project:member:add` — Add a project member [POST /projects/{projectId}/members] ids=person
- `project:member:candidates` — List members [GET /projects/members] ids=person
- `project:member:remove` — Remove a project member [DELETE /projects/{projectId}/members/{userId}] ids=person
- `project:resource:add` — Add a repository to a project [POST /projects/{projectId}/resources] ids=person
- `project:resource:remove` — Remove a project’s repository [DELETE /projects/{projectId}/resources/{resourceId}] ids=person
- `project:resource:update` — Update a project’s repository [PATCH /projects/{projectId}/resources/{resourceId}] ids=person
- `project:settings:get` — Get the workspace settings [GET /projects/settings] ids=person
- `project:settings:update` — Update the workspace settings [PATCH /projects/settings] ids=person
- `project:setup:create` — Create a project with its repository [POST /projectSetups] ids=person
- `project:setup:get` — Read a project’s initialization [GET /projectSetups/{projectId}] ids=person
- `project:update` — Update a project [PATCH /projects/{projectId}] ids=person/run

## project-manager (3)

- `project-manager:get` — Get the project manager [GET /projectManager] ids=person
- `project-manager:start` — Hand an issue to the project manager [POST /projectManager/issues/{issueId}/start] ids=person
- `project-manager:update` — Update the project manager [PATCH /projectManager] ids=person

## registry (6)

- `registry:check` — Check an image registry [POST /releases/registries/{registryId}/check] ids=person
- `registry:create` — Create an image registry [POST /releases/registries] ids=person
- `registry:delete` — Delete an image registry [DELETE /releases/registries/{registryId}] ids=person
- `registry:get` — Get an image registry [GET /releases/registries/{registryId}] ids=person
- `registry:list` — List image registries [GET /releases/registries] ids=person
- `registry:update` — Update an image registry [PATCH /releases/registries/{registryId}] ids=person

## release (18)

- `release:config-template` — Read a release's configuration template [GET /releases/apps/{appId}/releases/{releaseId}/configTemplate] ids=person
- `release:download` — Download a release's archive [GET /releases/apps/{appId}/releases/{releaseId}/archive] ids=person/run
- `release:download-link` — Make a download link for a release’s archive [POST /deploys/releases/{releaseId}/downloadLink] ids=person
- `release:get` — Get a release [GET /releases/apps/{appId}/releases/{releaseId}] ids=person
- `release:hub-counts` — Count the release hub’s tabs [GET /deploys/hubCounts] ids=person/run
- `release:image` — Register an image release [POST /releases/apps/{appId}/imageReleases] ids=person
- `release:list` — List an app's releases [GET /releases/apps/{appId}/releases] ids=person/run
- `release:mark-production` — Mark a release as deployed to production [POST /deploys/productionMarks] ids=person/run
- `release:pending` — List a project’s unreleased issues [GET /deploys/projects/{projectId}/unreleasedIssues] ids=person
- `release:permissions` — Get the caller and their release permissions [GET /releases/me] ids=person
- `release:pipeline` — List the projects’ release pipelines [GET /deploys/pipelines] ids=person/run
- `release:promote` — Promote a release to another app [POST /releases/apps/{appId}/releases/{releaseId}/promote] ids=person
- `release:show` — Read a release [GET /deploys/releases/{releaseId}] ids=person
- `release:unreleased` — List finished issues not in production [GET /deploys/unreleasedTasks] ids=person/run
- `release:update` — Replace a release's labels [PATCH /releases/apps/{appId}/releases/{releaseId}] ids=person
- `release:upload` — Create an upload ticket for a build’s archive [POST /builds/uploadTickets] ids=person
- `release:variables` — Read a release's variables manifest [GET /releases/apps/{appId}/releases/{releaseId}/variables] ids=person
- `release:versions` — List the releases of projects’ apps [GET /deploys/releases] ids=person

## report (6)

- `report:agents` — Get the agents' performance [GET /reports/agents] ids=person
- `report:attention` — Get what needs attention [GET /reports/attention] ids=person
- `report:delivery` — Get the dashboard delivery figures [GET /reports/delivery] ids=person
- `report:metrics` — Get the acceptance metrics [GET /reports/metrics] ids=person/run
- `report:projects` — Get the projects' progress [GET /reports/projects] ids=person
- `report:usage` — Get what agents’ runs used and cost [GET /reports/usage] ids=person/run

## run (13)

- `run:brief` — Get a run's brief [GET /agents/runs/{runId}/brief] ids=person
- `run:cancel` — Cancel a run [POST /agents/runs/{runId}/cancel] ids=person
- `run:events` — Read an agent run's transcript on an issue [GET /issueRuns/{runId}/events] ids=person/run
- `run:get` — Get an agent run on an issue [GET /issueRuns/{runId}] ids=person/run
- `run:list` — List runs [GET /agents/runs] ids=person
- `run:request:confirm` — Confirm a run request [POST /agents/runRequests/{requestId}/confirm] ids=person
- `run:request:get` — Get a run request [GET /agents/runRequests/{requestId}] ids=person
- `run:request:list` — List run requests [GET /agents/runRequests] ids=person
- `run:request:reject` — Reject a run request [POST /agents/runRequests/{requestId}/reject] ids=person
- `run:request:run-as-me` — Run a run request as the caller [POST /agents/runRequests/{requestId}/runAsMe] ids=person
- `run:request:withdraw` — Withdraw a run request [POST /agents/runRequests/{requestId}/withdraw] ids=person
- `run:retry` — Retry a run [POST /agents/runs/{runId}/retry] ids=person
- `run:workspace:reset` — Reset the working directory of a subject [POST /agents/workspaces/{subjectKind}/{subjectId}/reset] ids=person

## runtime (11)

- `runtime:delete` — Delete a runner [DELETE /agents/runners/{runnerId}] ids=person
- `runtime:get` — Get a runner [GET /agents/runners/{runnerId}] ids=person
- `runtime:list` — List runners [GET /agents/runners] ids=person
- `runtime:quota:clear` — Clear a runtime quota mark [POST /agents/runners/{runnerId}/quota/clear] ids=person
- `runtime:revoke` — Revoke a runner [POST /agents/runners/{runnerId}/revoke] ids=person
- `runtime:runs` — List a runner's recent runs [GET /agents/runners/{runnerId}/runs] ids=person
- `runtime:token:create` — Create a runner registration token [POST /agents/runners/registrationTokens] ids=person
- `runtime:token:list` — List usable runner registration tokens [GET /agents/runners/registrationTokens] ids=person
- `runtime:update` — Update a runner [PATCH /agents/runners/{runnerId}] ids=person
- `runtime:work` — List the work a runner holds [GET /agents/runners/{runnerId}/work] ids=person
- `runtime:workspaces` — Read runtime workspace diagnostics [GET /agents/runners/{runnerId}/workspaces] ids=person

## session (2)

- `session:context` — Read the current project selected for a My Agent session [GET /agentSessions/sessions/{sessionId}/context] ids=person
- `session:work` — Get the work tied to a session [GET /agentSessions/sessions/{sessionId}/work] ids=person

## skill (14)

- `skill:attachment:get` — Get a scope's default skills [GET /agents/skillAttachments/{scopeKind}/{scopeId}] ids=person
- `skill:attachment:set` — Replace a scope's default skills [PUT /agents/skillAttachments/{scopeKind}/{scopeId}] ids=person
- `skill:create` — Create a skill [POST /agents/skills] ids=person
- `skill:delete` — Delete a skill [DELETE /agents/skills/{skillId}] ids=person
- `skill:export` — Export a skill [GET /agents/skills/{skillId}/archive] ids=person
- `skill:file:get` — Download a skill file [GET /agents/skills/{skillId}/versions/{version}/file] ids=person
- `skill:get` — Get a skill [GET /agents/skills/{skillId}] ids=person
- `skill:import` — Import a skill [POST /agents/skills/import] ids=person
- `skill:list` — List skills [GET /agents/skills] ids=person
- `skill:update` — Save a skill [PATCH /agents/skills/{skillId}] ids=person
- `skill:upload` — Upload a skill file or archive [POST /agents/skills/uploads] ids=person
- `skill:version:get` — Get a skill version [GET /agents/skills/{skillId}/versions/{version}] ids=person
- `skill:version:list` — List a skill's versions [GET /agents/skills/{skillId}/versions] ids=person
- `skill:version:restore` — Restore a skill version [POST /agents/skills/{skillId}/versions/{version}/restore] ids=person

## studio (17)

- `studio:deploys:apps:version-summary:list` — Read a test app commit and changes since its release baseline [GET /deploys/apps/{id}/versionSummary] ids=person
- `studio:deploys:deployment-records:create` — Record a deployment without changing release status [POST /deploys/deploymentRecords] ids=person
- `studio:deploys:deployment-records:list` — List deployment records [GET /deploys/deploymentRecords] ids=person
- `studio:deploys:pending-version-tasks:list` — List tasks with merged pull requests awaiting a release tag [GET /deploys/pendingVersionTasks] ids=person
- `studio:deploys:release-lines:get` — Read confirmed release lines and saved suggestions for a repository resource [GET /deploys/releaseLines/{id}] ids=person
- `studio:deploys:release-lines:publish-target:list` — Resolve a release target and compare pending tasks without storing a snapshot [GET /deploys/releaseLines/{id}/publishTarget] ids=person
- `studio:deploys:release-lines:set` — Confirm release lines and establish their latest tag baselines [PUT /deploys/releaseLines/{id}] ids=person
- `studio:deploys:release-lines:tags:list` — Read at most 100 recent tags without storing suggestions [GET /deploys/releaseLines/{id}/tags] ids=person
- `studio:deploys:version-artifacts:create` — Associate an existing artifact with its repository commit [POST /deploys/versionArtifacts] ids=person
- `studio:deploys:version-environments:list` — Read saved test environment containment summaries [GET /deploys/versionEnvironments] ids=person
- `studio:deploys:version-pipelines:list` — Summarize release progress by project [GET /deploys/versionPipelines] ids=person
- `studio:deploys:version-progress:list` — Read release progress for up to 100 tasks [GET /deploys/versionProgress] ids=person
- `studio:deploys:versions:artifacts:list` — List artifacts built from this tag commit [GET /deploys/versions/{id}/artifacts] ids=person
- `studio:deploys:versions:deployments:list` — List recorded deployments of this version [GET /deploys/versions/{id}/deployments] ids=person
- `studio:deploys:versions:get` — Read a tag version and its counts [GET /deploys/versions/{id}] ids=person
- `studio:deploys:versions:list` — List published repository tags [GET /deploys/versions] ids=person
- `studio:deploys:versions:tasks:list` — List the tasks added on this release line [GET /deploys/versions/{id}/tasks] ids=person

## test-env (1)

- `test-env:list` — List test environments [GET /deploys/environments] ids=person/run

## user (18)

- `user:create` — Create a user [POST /users] ids=person
- `user:delete` — Delete a user [DELETE /users/{userId}] ids=person
- `user:disable` — Disable a user [POST /users/{userId}/disable] ids=person
- `user:enable` — Enable a user [POST /users/{userId}/enable] ids=person
- `user:invitation:create` — Invite people by email [POST /users/invitations] ids=person
- `user:invitation:delete` — Revoke an invitation [DELETE /users/invitations/{invitationId}] ids=person
- `user:invitation:list` — List pending and expired invitations [GET /users/invitations] ids=person
- `user:invitation:resend` — Send an invitation again [POST /users/invitations/{invitationId}/resend] ids=person
- `user:list` — List users [GET /users] ids=person
- `user:options` — List the role scopes and roles a user can be assigned [GET /users/options] ids=person
- `user:preference:delete` — Remove one of my preferences [DELETE /users/me/preferences/{key}] ids=person
- `user:preference:list` — List my preferences [GET /users/me/preferences] ids=person
- `user:preference:set` — Set one of my preferences [PUT /users/me/preferences/{key}] ids=person
- `user:preference:update` — Set several of my preferences [PATCH /users/me/preferences] ids=person
- `user:reset-password` — Reset a user's password [POST /users/{userId}/resetPassword] ids=person
- `user:revoke-sessions` — Sign a user out of every session [POST /users/{userId}/revokeSessions] ids=person
- `user:role-scope:set` — Replace a user's roles in one role scope [PUT /users/{userId}/roleScopes/{scope}] ids=person
- `user:update` — Update a user [PATCH /users/{userId}] ids=person

## users (1)

- `users:get` — Get a user [GET /users/{userId}] ids=person

## variable (5)

- `variable:audit:list` — List a scope's variable audit [GET /agents/variables/{scopeKind}/{scopeId}/audits] ids=person
- `variable:delete` — Delete a variable [DELETE /agents/variables/{scopeKind}/{scopeId}/{variableName}] ids=person
- `variable:list` — List a scope's variables [GET /agents/variables/{scopeKind}/{scopeId}] ids=person
- `variable:reveal` — Reveal a scope's variable values [POST /agents/variables/{scopeKind}/{scopeId}/reveal] ids=person
- `variable:set` — Set a variable [PUT /agents/variables/{scopeKind}/{scopeId}/{variableName}] ids=person

## C. Thuộc tính các schema Studio chính

### StudioProjectManager

- name: string
- description: string,null
- firstChoiceAgentId: string,null — The agent whose tool and model the project manager runs with; null until someone chooses.
- fallbackAgentId: string,null — The agent it runs with after the first choice queue delay, or immediately when no compatible runner can take the first choice.
- principles: string,null — The allocation principles in force; null for the built-in ones.
- commentRunLimit: integer — How many runs agents’ comments may start on one issue within 24 hours.
- fallbackAfterSeconds: integer
- delegationQueueTimeoutSeconds: integer
- builtInPrinciples: string
- choices: array<object>
- canEdit: boolean

### StudioRole

- key: string
- title: string|object|null
- builtIn: boolean
- editable: boolean — Whether its grants may be changed (not `owner`).
- pages: array<enum(pm-my-issues|pm-issues|pm-projects|agents|runtimes|skills|usage|rel-apps|reports|project-memory|knowledge)>
- settings: object — Every settings capability (`pm.general/read`) and account action (`user/read`) of the catalog, on or off.
- abilities: object — Every business action of the catalog (`pm.issues/edit`) at its level.
- holderIds: array<string> — Users assigned the role directly.
- holderCount: integer

### StudioAccessSettings

- defaultRole: string,null — The role a new member is given once, or null for none.

### StudioCiSetup

- resourceId: string
- repo: string,null — `owner/name` on its host; null for a repository not reached through a Git connection.
- key: object|null — The organization API key the CI uploads with (Settings › API keys); null before Studio made one.
- secretName: string — The repository secret holding the key.
- secretKind: string,null — What the host calls such a secret (`GitHub Actions secret`, `GitLab CI/CD variable`).
- provider: enum(github|gitlab|gitee)|null — The code host of the repository’s connection, whose CI file and commands apply; null without one.
- lastRotatedAt: string,null
- lastError: string,null — Why the key last failed, in English.
- lastFailure: object|null — The same failure by its reason and what it names (`demoConnection`, `noConnection`, `hostForbidden`, `repositoryNotFound`, `unknownEnvironme
- canManage: boolean — Whether the caller may set it up again or rotate the key (they manage the project).

### StudioCiSetupAnswer

### StudioCiWorkflowFile

- path: string — Where it goes: `.github/workflows/<name>.yml` on GitHub, `.gitlab/<name>.yml` (included from `.gitlab-ci.yml`) on GitLab, or `.workflow/<nam
- content: string — The CI file, YAML.

### StudioRepositoryDeployment

- resourceId: string
- projectId: string
- apps: array<object>
- repo: string,null — `owner/name` on its host, when linked to one.
- defaultBranch: string
- canEdit: boolean — Whether the caller may change the links.

### StudioDeploySettings

- previewEnvironmentId: string|null — The preview environment identifier.
- stagingEnvironmentId: string|null — The staging environment identifier.
- productionEnvironmentId: string|null — The production environment identifier.

### StudioGitConnection

- id: string
- provider: enum(github|gitlab|gitee)
- kind: enum(app|token)
- name: string
- account: string,null
- webUrl: string
- demo: boolean — Made by the demo data: Studio never calls its host, and refuses every call that would (`GIT_CONNECTION_DEMO`).
- repositoryAccessUrl: string,null — Where the repositories it may reach are chosen on the host: an app’s installation settings, a token’s group; null for a demo connection or a
- appId: string,null
- clientId: string,null
- installationId: string,null
- hasPrivateKey: boolean
- hasClientSecret: boolean
- hasToken: boolean
- hasWebhookSecret: boolean
- webhookUrl: string,null — An app’s webhook endpoint: absolute with `app.publicOrigin`, else a path on Studio’s origin.
- callbackUrl: string,null
- appSlug: string,null — The slug of an app Studio created from a manifest.
- installUrl: string,null
- appSettingsUrl: string,null
- personalMethods: array<enum(oauth|device|token)>
- allowPersonalTokens: boolean
- tokenExpiresAt: string|null — When a token connection’s token expires.
- problems: array<string> — What the host said keeps the connection from working fully when it was last saved.
- silentWebhookUrl: string,null — When webhooks are on but none has arrived: the address the host should reach.
- webhooks: boolean — Whether the code host delivers webhooks to Studio; off, Studio polls.
- lastDelivery: StudioGitWebhookDelivery|null
- lastReceivedAt: string|null
- usedBy: integer — How many linked repositories go through it.
- missingPermissions: array<string> — The permissions an app’s installation lacks of those Studio asks for, as `name:level` (`pull_requests:write`), until someone accepts them on
- permissionsUrl: string,null — Where the installation’s account reviews and accepts the app’s permissions.
- createdAt: string
- updatedAt: string

### StudioGitPullRequest

- id: string
- repo: string — `owner/name`, or a nested group’s full path.
- number: integer
- url: string
- title: string
- state: enum(open|closed|merged)
- draft: boolean
- headRef: string
- baseRef: string
- headSha: string
- mergeCommitSha: string,null — The commit the merge left on the base branch; null until merged.
- authorLogin: string
- provider: enum(github|gitlab|gitee)
- mergeability: enum(clean|conflicts|blocked|unknown) — Whether it can be merged: `clean`, `conflicts` with its base, `blocked` by the host’s own rules, or `unknown` while the host works it out.
- hostMergeState: string,null — The host’s own word for it (GitHub’s `mergeable_state`, GitLab’s `detailed_merge_status`).
- ciState: enum(pending|success|failure)|null
- checks: array<object>
- mergedAt: string|null
- mergedBy: object|null
- mergedManually: boolean
- closedAt: string|null
- snapshotAt: string|null — When the host was last read for it.
- linkedBy: object
- autoCompleteDisabled: boolean
- linkedAt: string
- mergeBlocker: enum(merged|closed|draft|conflicts|computing|ciPending|ciFailed|ciMissing|notConfigured|protected)|null — Why it cannot be merged by what Studio last read; null when it looks mergeable.
- mergeInStudio: boolean — Whether its host merges from Studio; otherwise it is merged on the host.
- checksSource: enum(host|external|agent) — Where its repository’s checks come from: the host’s CI, an external CI, or the agent’s self-check.

### StudioPreview

- id: string
- resourceId: string — The working directory whose pull request it previews.
- targetAppId: string,null — The App previewed; null for the repository itself.
- targetAppName: string,null
- appId: string — The preview’s own App.
- environmentId: string
- status: enum(waiting|deploying|ready|blocked|failed|destroyed)
- url: string,null — Absolute, or a path on Studio’s own origin; null until something is deployed.
- pullRequest: object|null — The pull request it belongs to.
- sha: string,null — The head it should run.
- deployedSha: string,null
- build: StudioBuild|null
- releaseId: string,null
- deploymentId: string,null
- error: string,null
- missingVariables: array<object> — For a `blocked` preview: the variables its build requires that nothing sets.
- runtime: object|null
- admin: object|null — The preview App’s first administrator: only for those who may edit the issue it is read through.
- updatedAt: string
- createdAt: string

### StudioIssueProgress

- personalRunnerRequests: array<object> — Personal runner consent requests visible to the issue owner or their original requester.
- waiting: object|null
- state: enum(working|queued|checksPending|needsDecision|waitingForContinuation|inReview|notStarted|finished|idle)
- managerWait: object
- agent: object|null
- step: string,null — The step the agent was handed: the first line of its hand-over.
- since: string,null
- runner: string,null
- pullRequest: object|null
- needsYou: string,null — The structured decision or input required from the owner.
- explanationCommentId: string,null — The latest undeleted project manager comment, independent of the status transition.
- next: string,null — The structured next step.
- handOver: boolean — The issue is open and has another or no executor, or the manager has never worked on it. Its owner may hand it to the manager.

### StudioInboxItem

- id: string — The in-app item id.
- kind: enum(decision|info)
- type: string — What happened, such as `approval_requested`.
- pending: boolean — A decision still waiting on the person.
- read: boolean
- issue: string,null — The issue it is about, such as `PM-12`.
- title: string
- body: string
- url: string,null — Where it opens in the application.
- createdAt: string

### StudioInboxNotice

- hidden: boolean
- notificationId: string
- source: string — Who sent it: the contributor’s id, such as `projects`.
- kind: enum(decision|info)
- type: string — What happened, such as `approval_requested`.
- subject: object|null
- decisionKey: string,null
- data: object|null — The sender’s own values, as its renderer reads them.
- count: integer
- resolvedAt: string|null
- outcome: string,null

### StudioAgentBoardEntry

- agentId: string
- state: enum(waiting|working|queued|idle)
- run: object|null
- queue: StudioAgentBoardWait|null — For `queued` with a run: why it waits, by the claim’s rules alone; the exact reason is `GET /agentBoard/issues/{issueId}/agents/{agentId}/wa
- blockedBy: array<object>|null
- waiting: object|null
- idle: object|null

### StudioIssueRun

- id: string
- agentId: string
- agent: string — The agent's name.
- status: enum(queued|dispatched|running|completed|failed|cancelled)
- trigger: string,null — Why it started, as its first input names it.
- attempt: integer
- createdAt: string
- startedAt: string,null
- finishedAt: string,null
- summary: string — Its summary, cut to 200 characters.
- failureReason: enum(runnerOffline|runnerOfflineBeforeStart|runnerDiskFull|leaseExpired|startTimeout|cancelled|idleTimeout|setupFailed|checkoutFailed|cliUnavailable|toolAuth|toolQuota|toolRateLimit|toolNetwork|toolProcess|contextOverflow|queuedExpired|delegatedQueueTimeout|modelUnavailable|stepLimit|policyRefused|prepareNetwork|workspaceBusy|runnerUpgrade|repoAccessUnavailable|repoAccessDenied|unknown)|null
- failure: string — Its failure detail, cut to 200 characters.

### StudioIssueRunEvent

- seq: integer
- at: string
- type: string
- tool: string,null
- text: string — Its content or output on one line, cut to 160 characters.
- content: string,null — Cut to 2000 characters.
- output: string,null — Cut to 2000 characters.
- input: obj

### StudioFollowUpIssue

- id: string
- identifier: string
- title: string
- statusKey: string
- projectId: string,null
- executorName: string,null
- lastActivityAt: string
- owned: boolean — The caller owns the issue.
- followed: boolean — The caller follows the issue, or would by default while they never chose.
- progress: StudioIssueProgress|null — What the issue waits for now; null for an owned issue in backlog.
- unread: integer — Comments and changes by others since `seenAt`, at most 99; 0 when never seen or not followed.
- seenAt: string,null — When the caller last looked at the issue here.

### StudioDeliveryFigures

- completed: integer — Throughput: issues that entered a done status.
- cycleTimeP50Ms: number,null — Median started → done, in milliseconds, of the completed issues that were started.
- agentShare: number,null — Of the completed issues, the share an agent executes.
- costPerIssue: StudioReportCosts|null — The cost of the usage reported in the period over the issues completed.

### StudioRepositoryCard

- resourceId: string — The working directory.
- name: string — `owner/name` on its host.
- provider: enum(github|gitlab|gitee)|null
- primary: boolean — The project’s first repository.
- linked: boolean — Linked to a repository of a Git connection.
- checks: object
- releaseLines: object
- branchRules: object
- preview: object
- webhook: object

### StudioPipeline

- project: object
- lead: object|null
- canManage: boolean — The caller manages the project.
- preview: object
- test: object
- production: object

### StudioReleaseRow

- canDeploy: boolean
- canMarkProduction: boolean
- id: string
- appId: string — The App CI uploaded it to (the source App of a promoted release).
- appName: string
- project: object
- version: string
- sha: string,null — The commit it was built from.
- kind: enum(archive|image)
- size: number,null — The archive’s size in bytes; null for images.
- checksum: string — The archive’s SHA-256; for an image release, its first image’s digest.
- createdAt: string
- runningIn: array<object>

### StudioDeployMark

- role: enum(staging|production) — `production` for a release target (a protected environment, or one named `production`), `staging` for any other.
- status: enum(checking|deployed|withdrawn)
- appId: string
- environmentId: string
- environmentName: string — What the mark is labelled with: the environment’s name.
- sha: string — The issue’s commit found in the deployment.
- version: string,null
- deploymentId: string
- withdrawnByDeploymentId: string,null
- withdrawnVersion: string,null
- deployedAt: string

### StudioProductionMark

- id: string
- projectId: string
- appId: string
- releaseId: string
- version: string
- sha: string,null
- note: string,null
- markedBy: object|null
- markedAt: string

### StudioOrgApiKeyScope

- groups: object

### StudioProjectInit

- projectId: string
- method: enum(template|prompt)
- state: enum(pending|running|failed|done)
- repo: object|null — The repository initialized; null for a directory on a runner.
- firstCommit: boolean — The initialization starts in a new empty repository; the first pushed commit is checked before automatic completion.
- appTemplate: enum(default)|null — The `create-app` template of a NocoBase application the agent scaffolds; null otherwise.
- agentId: string,null
- waitingForRunner: boolean — The agent’s run has not succeeded and no runner can run the agent now: the initialization waits for one.
- issueId: string,null — The "Initialize project" issue.
- runSucceeded: boolean
- pushed: boolean
- error: string,null
- completedAt: string|null

### StudioDelegation

- id: string
- conversationId: string
- issueId: string
- agentId: string — The agent the work went to.
- userId: string — The conversation's owner.
- followed: boolean
- createdAt: string
- updatedAt: string

### StudioKbDoc
