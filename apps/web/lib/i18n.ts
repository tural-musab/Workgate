import { enUS, tr as trLocale } from "date-fns/locale";

import type { AgentRole, ArtifactType, RunStatus, TaskType } from "@aiteams/shared";

export const locales = ["en", "tr"] as const;
export type Locale = (typeof locales)[number];

export const LOCALE_COOKIE = "aiteams_locale";

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
    brand: "AI TeamS",
    language: "Language",
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
    title: "Operator console",
    description: "Route work, inspect runs, gate approvals, and push reviewed changes into GitHub from one control surface."
  },
  loginPage: {
    eyebrow: "AI TeamS",
    title: "Single-pane control for your AI software office",
    description:
      "Route work, inspect agent artefacts, enforce approvals, and ship draft pull requests from a restrained operator dashboard instead of a loose collection of scripts.",
    featureOne: "Fixed pipeline across routing, planning, engineering, review, and docs.",
    featureTwo: "GitHub writes are blocked until the operator explicitly approves the run."
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
    eyebrow: "AI software office",
    title: "Runs, approvals, and repo output in one pane",
    description:
      "Submit work against trusted repositories, inspect each role output, and stop every branch push behind an explicit operator gate.",
    totalRuns: "Total runs",
    pendingApprovals: "Pending approvals",
    failedRuns: "Failed runs",
    runLedger: "Run ledger",
    recentRuns: "Recent runs",
    noRuns: "No runs yet. Launch the first task above.",
    controlNotes: "Control notes",
    operatorReminders: "Operator reminders",
    noteOne: "Branch push and draft pull request creation are blocked until you approve a run.",
    noteTwo: "GitHub execution is limited to repositories on the explicit allowlist stored in settings.",
    noteThree: "Without live PostgreSQL, the product stays usable through in-memory storage and an inline queue driver.",
    approvalQueue: "Approval queue",
    waitingOnYou: "Waiting on you",
    noApprovals: "No runs are waiting for approval."
  },
  taskComposer: {
    eyebrow: "New task",
    title: "Launch a software-office run",
    description:
      "Submit a repository target, the job to be done, and the acceptance bar. The fixed pipeline will route, plan, review, and hold for approval before any external write action.",
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
    idleHint: "The run will stop for approval before any push or PR action.",
    submit: "Start run",
    pending: "Starting..."
  },
  approvalsPage: {
    eyebrow: "Approval queue",
    title: "Runs blocked behind human review",
    description: "This queue is the last safeguard before AI TeamS writes branches or opens draft pull requests on GitHub.",
    empty: "No pending approvals right now."
  },
  settingsPage: {
    eyebrow: "Settings",
    title: "Runtime and integration controls",
    description:
      "GitHub is the only external integration in v1. Providers remain multi-model by policy, but branch push and draft PR creation stay behind a single operator account.",
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
      "Store a fine-grained PAT and an explicit repo allowlist. AI TeamS will refuse execution against repositories outside this list.",
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
    branchLabel: "Branch",
    managedBranchLabel: "Managed branch",
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
    taskSource: "Task source",
    inputs: "Inputs",
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
    test_report: "Test report",
    review_report: "Review report",
    changelog: "Change summary"
  },
  apiMessages: {
    invalidCredentials: "Invalid credentials.",
    unableToStartRun: "Unable to start the run.",
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
    brand: "AI TeamS",
    language: "Dil",
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
    title: "Operatör konsolu",
    description: "İşleri yönlendir, run kayıtlarını incele, onayları denetle ve incelenmiş değişiklikleri tek panelden GitHub'a gönder."
  },
  loginPage: {
    eyebrow: "AI TeamS",
    title: "AI yazılım ofisin için tek panel kontrol",
    description:
      "İşleri yönlendir, agent çıktılarını incele, onayları uygula ve dağınık script'ler yerine kontrollü bir operatör panelinden taslak pull request gönder.",
    featureOne: "Routing, planlama, mühendislik, review ve docs için sabit pipeline.",
    featureTwo: "Operatör açıkça onay vermeden GitHub yazma işlemleri engellenir."
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
    eyebrow: "AI yazılım ofisi",
    title: "Run'lar, onaylar ve repo çıktıları tek panelde",
    description:
      "Güvenilen repolara karşı iş başlat, her rolün çıktısını incele ve branch push işlemlerini açık operatör kapısının arkasında tut.",
    totalRuns: "Toplam run",
    pendingApprovals: "Bekleyen onay",
    failedRuns: "Başarısız run",
    runLedger: "Run kayıtları",
    recentRuns: "Son run'lar",
    noRuns: "Henüz run yok. İlk görevi yukarıdan başlat.",
    controlNotes: "Kontrol notları",
    operatorReminders: "Operatör hatırlatmaları",
    noteOne: "Sen onaylamadan branch push ve taslak pull request oluşturulmaz.",
    noteTwo: "GitHub çalışması yalnızca ayarlardaki açık allowlist içindeki repolarla sınırlıdır.",
    noteThree: "Canlı PostgreSQL yoksa ürün yine de bellek içi depolama ve inline queue ile kullanılabilir.",
    approvalQueue: "Onay kuyruğu",
    waitingOnYou: "Seni bekliyor",
    noApprovals: "Onay bekleyen run yok."
  },
  taskComposer: {
    eyebrow: "Yeni görev",
    title: "Yazılım ofisi run'ı başlat",
    description:
      "Hedef repoyu, yapılacak işi ve kabul çıtasını gönder. Sabit pipeline, dış yazma aksiyonlarından önce route edecek, planlayacak, review edecek ve onayda bekleyecek.",
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
    idleHint: "Herhangi bir push veya PR aksiyonundan önce run onayda duracaktır.",
    submit: "Run başlat",
    pending: "Başlatılıyor..."
  },
  approvalsPage: {
    eyebrow: "Onay kuyruğu",
    title: "İnsan incelemesinin arkasında bekleyen run'lar",
    description: "Bu kuyruk, AI TeamS'in GitHub'a branch yazmadan veya taslak pull request açmadan önceki son güvenlik katmanıdır.",
    empty: "Şu anda bekleyen onay yok."
  },
  settingsPage: {
    eyebrow: "Ayarlar",
    title: "Çalışma zamanı ve entegrasyon kontrolleri",
    description:
      "v1 içinde tek dış entegrasyon GitHub'dır. Sağlayıcılar politika gereği çok modelli kalır, ama branch push ve taslak PR oluşturma tek operatör hesabının arkasında tutulur.",
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
      "Fine-grained PAT ve açık repo allowlist'ini sakla. AI TeamS, bu listenin dışındaki repolarda çalışmayı reddeder.",
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
    branchLabel: "Branch",
    managedBranchLabel: "Yönetilen branch",
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
    taskSource: "Görev kaynağı",
    inputs: "Girdiler",
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
    test_report: "Test raporu",
    review_report: "İnceleme raporu",
    changelog: "Değişiklik özeti"
  },
  apiMessages: {
    invalidCredentials: "Geçersiz bilgiler.",
    unableToStartRun: "Run başlatılamadı.",
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
