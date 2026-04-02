import { enUS, tr as trLocale } from "date-fns/locale";

import type { AgentRole, ArtifactType, RunStatus, TaskType } from "@workgate/shared";

export const locales = ["en", "tr"] as const;
export type Locale = (typeof locales)[number];

export const LOCALE_COOKIE = "workgate_locale";

function hasLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function normalizeLocale(value?: string | null): Locale {
  return value && hasLocale(value) ? value : "en";
}

export function getDateFnsLocale(locale: Locale) {
  return locale === "tr" ? trLocale : enUS;
}

const en = {
  common: {
    brand: "Workgate",
    language: "Language",
    workflow: "Workflow",
    branch: "Branch",
    managedBranch: "Managed branch",
    none: "None",
    notConfigured: "Not configured",
    runtime: "Runtime",
    storage: "Storage",
    queue: "Queue",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    cancel: "Cancel",
    delete: "Delete",
    retry: "Retry",
    openRunDetail: "Open run detail",
    viewApprovalQueue: "View approval queue",
    onRepositoryBranch: "on",
    updated: "Updated"
  },
  languageSwitcher: {
    compactLabel: "EN / TR",
    loading: "Updating..."
  },
  nav: {
    dashboard: "Dashboard",
    approvals: "Approvals",
    settings: "Settings"
  },
  appShell: {
    title: "Workflow control plane",
    description: "Run prebuilt AI teams, inspect every handoff, and stop high-stakes output behind a human gate."
  },
  loginPage: {
    eyebrow: "Workgate",
    title: "Prebuilt AI teams, human-approved",
    description:
      "Launch workflow-specific AI teams for software delivery, proposal operations, and other approval-heavy work from one controlled operator surface.",
    featureOne: "Template-first teams with routing, planning, review, and documentation already wired in.",
    featureTwo: "High-stakes outputs pause for human approval before they leave the platform."
  },
  loginForm: {
    title: "Operator sign-in",
    description: "Use the seeded admin credentials from your environment file.",
    username: "Username",
    password: "Password",
    submit: "Sign in",
    pending: "Signing in..."
  },
  dashboard: {
    eyebrow: "Workflow platform",
    title: "Template-led AI work in one control surface",
    description:
      "Launch prebuilt teams, inspect every run, and keep client-ready or repo-bound output behind explicit approval gates.",
    totalRuns: "Total runs",
    pendingApprovals: "Pending approvals",
    failedRuns: "Failed runs",
    runLedger: "Run ledger",
    recentRuns: "Recent runs",
    noRuns: "No runs yet. Launch the first task above.",
    controlNotes: "Control notes",
    operatorReminders: "Operator reminders",
    noteOne: "Every workflow pauses for human approval before external release or GitHub write actions.",
    noteTwo: "GitHub execution applies only to the Software Delivery Team and only for repositories on the explicit allowlist.",
    noteThree: "Without live PostgreSQL, the platform stays usable through in-memory storage and an inline queue driver.",
    approvalQueue: "Approval queue",
    waitingOnYou: "Waiting on you",
    noApprovals: "No runs are waiting for approval."
  },
  taskComposer: {
    eyebrow: "New run",
    title: "Launch a workflow team",
    description:
      "Choose a workflow template, define the target and success bar, then let the team route, plan, review, and stop for approval before anything ships.",
    workflowEyebrow: "Workflow library",
    workflowTitle: "Pick the team that should run this job",
    workflowDescription: "Active templates can run now. The next verticals are shown here so the product direction stays visible.",
    activeNow: "Active now",
    comingSoon: "Coming soon",
    titleLabel: "Title",
    titlePlaceholder: "Fix flaky CI notifications",
    taskTypeLabel: "Task type",
    goalLabel: "Goal",
    goalPlaceholder: "Describe the desired outcome, context, and why the work matters.",
    targetRepoLabel: "Target repo",
    targetRepoPlaceholder: "owner/repo",
    targetBranchLabel: "Target branch",
    targetBranchPlaceholder: "main",
    constraintsLabel: "Constraints",
    constraintsPlaceholder: "One constraint per line",
    acceptanceCriteriaLabel: "Acceptance criteria",
    acceptanceCriteriaPlaceholder: "One acceptance criterion per line",
    attachmentNameLabel: "Attachment name",
    attachmentNamePlaceholder: "brief.md",
    attachmentContentLabel: "Attachment content",
    attachmentContentPlaceholder: "Optional supporting context, logs, or issue notes",
    idleHint: "The run will stop for approval before any external action.",
    submit: "Start run",
    pending: "Starting..."
  },
  approvalsPage: {
    eyebrow: "Approval queue",
    title: "Runs blocked behind human review",
    description: "This queue is the final gate before Workgate releases client-ready output or writes branches in GitHub.",
    empty: "No pending approvals right now."
  },
  settingsPage: {
    eyebrow: "Settings",
    title: "Runtime and integration controls",
    description:
      "Workgate keeps workflow policy, model routing, and external connectors behind one operator surface. In v1, GitHub applies only to the Software Delivery Team.",
    runtimeEyebrow: "Runtime",
    runtimeTitle: "Local execution",
    storageMode: "Storage mode",
    queueMode: "Queue mode",
    suggestedBranch: "Suggested branch template",
    modelPolicyEyebrow: "Model policy",
    modelPolicyTitle: "Default routing map"
  },
  githubSettings: {
    eyebrow: "GitHub",
    title: "Repository access",
    description:
      "Store a fine-grained PAT and an explicit repo allowlist. Workgate uses this connector only for the Software Delivery Team.",
    currentToken: "Current token",
    patLabel: "Fine-grained PAT",
    reposLabel: "Allowlisted repos",
    reposPlaceholder: "owner/repo\nowner/another-repo",
    encryptedNote: "Settings are encrypted before storage.",
    save: "Save settings",
    saving: "Saving...",
    saved: "GitHub settings saved."
  },
  approvalActions: {
    eyebrow: "Approval gate",
    title: "Human decision required",
    placeholder: "Optional approval or rejection note",
    approve: "Approve and create draft PR",
    reject: "Reject run"
  },
  runActions: {
    eyebrow: "Run actions",
    title: "Manage this run",
    retryHint: "Choose whether to restart the whole pipeline or only the missing stages.",
    retryFull: "Retry full run",
    retryFailedOnly: "Retry failed-only",
    cancel: "Cancel run",
    delete: "Delete run",
    cancelling: "Cancelling...",
    deleting: "Deleting...",
    retrying: "Retrying...",
    confirmCancel: "Cancel this run? The current stage will stop after the in-flight work finishes.",
    confirmDelete: "Delete this run and all related logs? This cannot be undone."
  },
  runDetail: {
    workflowLabel: "Workflow",
    branchLabel: "Branch",
    managedBranchLabel: "Managed branch",
    lastCompleted: "Last completed",
    totalInputTokens: "Input tokens",
    totalOutputTokens: "Output tokens",
    totalCost: "Cost",
    executionMode: "Execution mode",
    stepDuration: "Duration",
    executionTimeline: "Execution timeline",
    completedSteps: "Completed steps",
    noCompletedSteps: "The run has not emitted completed steps yet.",
    completed: "Completed",
    inProgress: "In progress",
    artefacts: "Artefacts",
    generatedOutputs: "Generated outputs",
    approvals: "Approvals",
    decisionLog: "Decision log",
    noApprovals: "No approval records yet.",
    pending: "pending",
    eventLog: "Event log",
    eventTimeline: "Event timeline",
    noEvents: "No event entries recorded yet.",
    taskSource: "Task source",
    inputs: "Inputs",
    workflowInput: "Workflow input",
    constraints: "Constraints",
    acceptanceCriteria: "Acceptance criteria",
    noArtifacts: "No artefacts generated yet."
  },
  status: {
    queued: "Queued",
    routing: "Routing",
    planning: "Planning",
    executing: "Executing",
    reviewing: "Reviewing",
    pending_human: "Pending human",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled"
  },
  taskTypes: {
    bugfix: "Bugfix",
    feature: "Feature",
    research: "Research",
    ops: "Ops"
  },
  roles: {
    router: "Router",
    coordinator: "Coordinator",
    research: "Research",
    pm: "Product",
    architect: "Architect",
    engineer: "Engineer",
    reviewer: "Reviewer",
    docs: "Docs"
  },
  artifactTypes: {
    research_note: "Research note",
    prd: "Product brief",
    architecture_memo: "Architecture memo",
    patch_summary: "Patch summary",
    diff_preview: "Diff preview",
    test_report: "Test report",
    review_report: "Review report",
    approval_checklist: "Approval checklist",
    release_packet: "Release packet",
    changelog: "Change summary"
  },
  apiMessages: {
    invalidCredentials: "Invalid credentials.",
    unableToStartRun: "Unable to start the run.",
    workflowTemplateInactive: "This workflow template is not active yet.",
    invalidSoftwareRepo: "Software Delivery Team requires a valid GitHub repository slug.",
    unableToSaveSettings: "Unable to save settings.",
    unableToSaveGitHubSettings: "Unable to save GitHub settings.",
    approvalFailed: "Approval failed.",
    rejectFailed: "Reject failed.",
    actionFailed: "Action failed.",
    runCannotBeCancelled: "This run can no longer be cancelled.",
    runCannotBeDeleted: "Only completed, failed, or cancelled runs can be deleted.",
    runCannotBeRetried: "Only completed, failed, or cancelled runs can be retried.",
    unauthorized: "Unauthorized.",
    runNotFound: "Run not found.",
    runNotPendingApproval: "Run is not waiting for approval.",
    githubTokenNotConfigured: "GitHub token is not configured.",
    githubSettingsPayloadInvalid: "GitHub settings payload is invalid."
  }
} as const;

type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

type Messages = DeepStringify<typeof en>;

const tr: Messages = {
  common: {
    brand: "Workgate",
    language: "Dil",
    workflow: "Workflow",
    branch: "Branch",
    managedBranch: "Yönetilen branch",
    none: "Yok",
    notConfigured: "Yapılandırılmadı",
    runtime: "Çalışma zamanı",
    storage: "Depolama",
    queue: "Kuyruk",
    signedInAs: "Giriş yapan",
    signOut: "Çıkış yap",
    cancel: "İptal et",
    delete: "Sil",
    retry: "Tekrar dene",
    openRunDetail: "Run detayını aç",
    viewApprovalQueue: "Onay kuyruğunu gör",
    onRepositoryBranch: "üzerinde",
    updated: "Güncellendi"
  },
  languageSwitcher: {
    compactLabel: "TR / EN",
    loading: "Güncelleniyor..."
  },
  nav: {
    dashboard: "Panel",
    approvals: "Onaylar",
    settings: "Ayarlar"
  },
  appShell: {
    title: "Workflow kontrol düzlemi",
    description: "Hazır AI ekiplerini çalıştır, her teslimi incele ve yüksek etkili çıktıları insan onay kapısının arkasında tut."
  },
  loginPage: {
    eyebrow: "Workgate",
    title: "Hazır AI ekipleri, insan onayıyla",
    description:
      "Yazılım teslimi, teklif operasyonları ve diğer onay ağırlıklı işler için workflow odaklı AI ekiplerini tek operatör yüzeyinden çalıştır.",
    featureOne: "Yönlendirme, planlama, inceleme ve dokümantasyon içeren şablon ekipler hazır gelir.",
    featureTwo: "Yüksek etkili çıktılar platform dışına çıkmadan önce insan onayında durur."
  },
  loginForm: {
    title: "Operatör girişi",
    description: "`.env` dosyandaki seed admin bilgilerini kullan.",
    username: "Kullanıcı adı",
    password: "Şifre",
    submit: "Giriş yap",
    pending: "Giriş yapılıyor..."
  },
  dashboard: {
    eyebrow: "Workflow platformu",
    title: "Şablon bazlı AI işleri tek kontrol yüzeyinde",
    description:
      "Hazır ekipleri başlat, her run'ı incele ve repo veya müşteri çıktısını açık onay kapılarının arkasında tut.",
    totalRuns: "Toplam run",
    pendingApprovals: "Bekleyen onay",
    failedRuns: "Başarısız run",
    runLedger: "Run kayıtları",
    recentRuns: "Son run'lar",
    noRuns: "Henüz run yok. İlk görevi yukarıdan başlat.",
    controlNotes: "Kontrol notları",
    operatorReminders: "Operatör hatırlatmaları",
    noteOne: "Her workflow, dış sistemlere çıkmadan veya GitHub'a yazmadan önce insan onayında durur.",
    noteTwo: "GitHub çalıştırmaları yalnızca Yazılım Teslim Ekibi için ve allowlist'teki depolarla sınırlıdır.",
    noteThree: "Canlı PostgreSQL olmadan platform, bellek içi depolama ve inline queue ile yine kullanılabilir kalır.",
    approvalQueue: "Onay kuyruğu",
    waitingOnYou: "Seni bekliyor",
    noApprovals: "Onay bekleyen run yok."
  },
  taskComposer: {
    eyebrow: "Yeni run",
    title: "Bir workflow ekibi başlat",
    description:
      "Workflow şablonunu seç, hedefi ve başarı çıtasını tanımla. Takım işi yönlendirsin, planlasın, incelesin ve bir şey yayınlamadan önce onayda dursun.",
    workflowEyebrow: "Workflow kütüphanesi",
    workflowTitle: "Bu işi hangi ekip çalıştıracak?",
    workflowDescription: "Aktif şablonlar şimdi çalışır. Sıradaki dikeyler de ürün yönünü görünür tutmak için burada durur.",
    activeNow: "Şimdi aktif",
    comingSoon: "Yakında",
    titleLabel: "Başlık",
    titlePlaceholder: "Kararsız CI bildirimlerini düzelt",
    taskTypeLabel: "Görev türü",
    goalLabel: "Amaç",
    goalPlaceholder: "İstenen sonucu, bağlamı ve bu işin neden önemli olduğunu açıkla.",
    targetRepoLabel: "Hedef repo",
    targetRepoPlaceholder: "owner/repo",
    targetBranchLabel: "Hedef branch",
    targetBranchPlaceholder: "main",
    constraintsLabel: "Kısıtlar",
    constraintsPlaceholder: "Her satıra bir kısıt yaz",
    acceptanceCriteriaLabel: "Kabul kriterleri",
    acceptanceCriteriaPlaceholder: "Her satıra bir kabul kriteri yaz",
    attachmentNameLabel: "Ek adı",
    attachmentNamePlaceholder: "brief.md",
    attachmentContentLabel: "Ek içeriği",
    attachmentContentPlaceholder: "İsteğe bağlı bağlam, log veya issue notları",
    idleHint: "Her dış aksiyondan önce run onay için duracak.",
    submit: "Run başlat",
    pending: "Başlatılıyor..."
  },
  approvalsPage: {
    eyebrow: "Onay kuyruğu",
    title: "İnsan incelemesinin arkasında bekleyen run'lar",
    description: "Bu kuyruk, Workgate'in müşteriye hazır çıktı yayınlamasından veya GitHub'a branch yazmasından önceki son kapıdır.",
    empty: "Şu anda bekleyen onay yok."
  },
  settingsPage: {
    eyebrow: "Ayarlar",
    title: "Çalışma zamanı ve entegrasyon kontrolleri",
    description:
      "Workgate workflow politika setlerini, model yönlendirmesini ve dış connector'ları tek operatör yüzeyinde tutar. v1'de GitHub yalnızca Yazılım Teslim Ekibi için kullanılır.",
    runtimeEyebrow: "Çalışma zamanı",
    runtimeTitle: "Yerel çalışma",
    storageMode: "Depolama modu",
    queueMode: "Kuyruk modu",
    suggestedBranch: "Önerilen branch şablonu",
    modelPolicyEyebrow: "Model politikası",
    modelPolicyTitle: "Varsayılan yönlendirme haritası"
  },
  githubSettings: {
    eyebrow: "GitHub",
    title: "Repo erişimi",
    description:
      "Fine-grained PAT ve açık repo allowlist'ini sakla. Workgate bu connector'ı yalnızca Yazılım Teslim Ekibi için kullanır.",
    currentToken: "Mevcut token",
    patLabel: "Fine-grained PAT",
    reposLabel: "Allowlist repolar",
    reposPlaceholder: "owner/repo\nowner/diger-repo",
    encryptedNote: "Ayarlar depolanmadan önce şifrelenir.",
    save: "Ayarları kaydet",
    saving: "Kaydediliyor...",
    saved: "GitHub ayarları kaydedildi."
  },
  approvalActions: {
    eyebrow: "Onay kapısı",
    title: "İnsan kararı gerekli",
    placeholder: "İsteğe bağlı onay veya red notu",
    approve: "Onayla ve taslak PR oluştur",
    reject: "Run'ı reddet"
  },
  runActions: {
    eyebrow: "Run aksiyonları",
    title: "Bu run'ı yönet",
    retryHint: "Tüm pipeline'ı mı yoksa yalnız eksik kalan aşamaları mı tekrar başlatacağını seç.",
    retryFull: "Run'ı baştan tekrar dene",
    retryFailedOnly: "Sadece başarısız kısmı tekrar dene",
    cancel: "Run'ı iptal et",
    delete: "Run'ı sil",
    cancelling: "İptal ediliyor...",
    deleting: "Siliniyor...",
    retrying: "Tekrar deneniyor...",
    confirmCancel: "Bu run iptal edilsin mi? O anda çalışan adım bitince akış durur.",
    confirmDelete: "Bu run ve ilişkili tüm loglar silinsin mi? Bu işlem geri alınamaz."
  },
  runDetail: {
    workflowLabel: "Workflow",
    branchLabel: "Branch",
    managedBranchLabel: "Yönetilen branch",
    lastCompleted: "Son tamamlanan",
    totalInputTokens: "Input token",
    totalOutputTokens: "Output token",
    totalCost: "Maliyet",
    executionMode: "Yürütme modu",
    stepDuration: "Süre",
    executionTimeline: "Yürütme zaman çizelgesi",
    completedSteps: "Tamamlanan adımlar",
    noCompletedSteps: "Run henüz tamamlanmış adım üretmedi.",
    completed: "Tamamlandı",
    inProgress: "Devam ediyor",
    artefacts: "Çıktılar",
    generatedOutputs: "Üretilen çıktılar",
    approvals: "Onaylar",
    decisionLog: "Karar kaydı",
    noApprovals: "Henüz onay kaydı yok.",
    pending: "bekliyor",
    eventLog: "Olay kaydı",
    eventTimeline: "Olay zaman çizelgesi",
    noEvents: "Henüz kayıtlı olay yok.",
    taskSource: "Görev kaynağı",
    inputs: "Girdiler",
    workflowInput: "Workflow girdi paketi",
    constraints: "Kısıtlar",
    acceptanceCriteria: "Kabul kriterleri",
    noArtifacts: "Henüz üretilmiş çıktı yok."
  },
  status: {
    queued: "Kuyrukta",
    routing: "Yönlendiriliyor",
    planning: "Planlanıyor",
    executing: "Çalışıyor",
    reviewing: "İnceleniyor",
    pending_human: "İnsan onayı bekliyor",
    completed: "Tamamlandı",
    failed: "Başarısız",
    cancelled: "İptal edildi"
  },
  taskTypes: {
    bugfix: "Hata düzeltme",
    feature: "Özellik",
    research: "Araştırma",
    ops: "Operasyon"
  },
  roles: {
    router: "Yönlendirici",
    coordinator: "Koordinatör",
    research: "Araştırma",
    pm: "Ürün",
    architect: "Mimar",
    engineer: "Mühendis",
    reviewer: "İnceleyici",
    docs: "Dokümantasyon"
  },
  artifactTypes: {
    research_note: "Araştırma notu",
    prd: "Ürün özeti",
    architecture_memo: "Mimari not",
    patch_summary: "Patch özeti",
    diff_preview: "Diff önizlemesi",
    test_report: "Test raporu",
    review_report: "İnceleme raporu",
    approval_checklist: "Onay kontrol listesi",
    release_packet: "Teslim paketi",
    changelog: "Değişiklik özeti"
  },
  apiMessages: {
    invalidCredentials: "Geçersiz bilgiler.",
    unableToStartRun: "Run başlatılamadı.",
    workflowTemplateInactive: "Bu workflow şablonu henüz aktif değil.",
    invalidSoftwareRepo: "Yazılım Teslim Ekibi için geçerli bir GitHub repo adresi gerekir.",
    unableToSaveSettings: "Ayarlar kaydedilemedi.",
    unableToSaveGitHubSettings: "GitHub ayarları kaydedilemedi.",
    approvalFailed: "Onay işlemi başarısız oldu.",
    rejectFailed: "Red işlemi başarısız oldu.",
    actionFailed: "İşlem başarısız oldu.",
    runCannotBeCancelled: "Bu run artık iptal edilemez.",
    runCannotBeDeleted: "Yalnızca tamamlanmış, başarısız veya iptal edilmiş run'lar silinebilir.",
    runCannotBeRetried: "Yalnızca tamamlanmış, başarısız veya iptal edilmiş run'lar tekrar denenebilir.",
    unauthorized: "Yetkisiz erişim.",
    runNotFound: "Run bulunamadı.",
    runNotPendingApproval: "Run şu anda onay beklemiyor.",
    githubTokenNotConfigured: "GitHub token yapılandırılmadı.",
    githubSettingsPayloadInvalid: "GitHub ayar verisi geçersiz."
  }
};

const dictionaries = { en, tr };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

export function getStatusLabel(status: RunStatus, messages: Messages) {
  return messages.status[status];
}

export function getTaskTypeLabel(taskType: TaskType, messages: Messages) {
  return messages.taskTypes[taskType];
}

export function getRoleLabel(role: AgentRole, messages: Messages) {
  return messages.roles[role];
}

export function getArtifactTypeLabel(artifactType: ArtifactType, messages: Messages) {
  return messages.artifactTypes[artifactType];
}

const apiMessageMap: Record<string, keyof Messages["apiMessages"]> = {
  Unauthorized: "unauthorized",
  "Unauthorized.": "unauthorized",
  "Invalid credentials": "invalidCredentials",
  "Invalid credentials.": "invalidCredentials",
  "Unable to create task.": "unableToStartRun",
  "Unable to start the run.": "unableToStartRun",
  "This workflow template is not active yet.": "workflowTemplateInactive",
  "Software Delivery Team requires a valid GitHub repository slug.": "invalidSoftwareRepo",
  "Unable to save settings.": "unableToSaveSettings",
  "Unable to save GitHub settings.": "unableToSaveGitHubSettings",
  "Approval failed.": "approvalFailed",
  "Reject failed.": "rejectFailed",
  "Action failed.": "actionFailed",
  "Run can no longer be cancelled.": "runCannotBeCancelled",
  "Only completed, failed, or cancelled runs can be deleted.": "runCannotBeDeleted",
  "Only completed, failed, or cancelled runs can be retried.": "runCannotBeRetried",
  "Run not found": "runNotFound",
  "Run not found.": "runNotFound",
  "Run is not waiting for approval.": "runNotPendingApproval",
  "GitHub token is not configured": "githubTokenNotConfigured",
  "GitHub token is not configured.": "githubTokenNotConfigured",
  "GitHub settings payload is invalid": "githubSettingsPayloadInvalid",
  "GitHub settings payload is invalid.": "githubSettingsPayloadInvalid"
};

export function resolveApiMessage(raw: string | null | undefined, messages: Messages, fallback: keyof Messages["apiMessages"]) {
  if (!raw) {
    return messages.apiMessages[fallback];
  }

  const key = apiMessageMap[raw];
  return key ? messages.apiMessages[key] : raw;
}

export type { Messages };
