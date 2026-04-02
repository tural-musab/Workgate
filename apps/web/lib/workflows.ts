import type { WorkflowTemplateId } from "@aiteams/shared";

import type { Locale } from "./i18n";

export type WorkflowStage = "active" | "coming_soon";

export type WorkflowPresentation = {
  id: WorkflowTemplateId;
  stage: WorkflowStage;
  name: string;
  eyebrow: string;
  description: string;
  targetPrimaryLabel: string;
  targetPrimaryPlaceholder: string;
  targetSecondaryLabel: string;
  targetSecondaryPlaceholder: string;
  goalPlaceholder: string;
  attachmentNameDefault: string;
  attachmentContentPlaceholder: string;
  idleHint: string;
  reviewerHint: string;
  accentText: string;
  accentBorder: string;
  selectedCard: string;
  idleCard: string;
  tintPanel: string;
  button: string;
};

const catalog: Record<Locale, WorkflowPresentation[]> = {
  en: [
    {
      id: "software_delivery",
      stage: "active",
      name: "Software Delivery Team",
      eyebrow: "Engineering workflow",
      description: "Repository-aware AI team for software delivery, code review, and GitHub-gated approvals.",
      targetPrimaryLabel: "Target repository",
      targetPrimaryPlaceholder: "owner/repo",
      targetSecondaryLabel: "Target branch",
      targetSecondaryPlaceholder: "main",
      goalPlaceholder: "Describe the engineering outcome, affected systems, and why the change matters.",
      attachmentNameDefault: "brief.md",
      attachmentContentPlaceholder: "Issue notes, stack traces, acceptance details, or architecture context",
      idleHint: "Approvals create draft pull requests only after the software run passes review.",
      reviewerHint: "GitHub write access stays blocked until the operator approves the run.",
      accentText: "text-cyan-200/80",
      accentBorder: "border-cyan-300/30",
      selectedCard: "border-cyan-300/50 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_18px_50px_rgba(14,116,144,0.22)]",
      idleCard: "border-white/10 bg-white/[0.03] hover:border-cyan-300/20 hover:bg-cyan-400/[0.05]",
      tintPanel: "border-cyan-300/20 bg-[linear-gradient(180deg,rgba(10,25,36,0.95),rgba(5,11,16,0.88))]",
      button: "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
    },
    {
      id: "rfp_response",
      stage: "active",
      name: "RFP Response Team",
      eyebrow: "Proposal workflow",
      description: "Prebuilt AI team for capture planning, response drafting, review, and final approval packets.",
      targetPrimaryLabel: "Account or opportunity",
      targetPrimaryPlaceholder: "Acme Corp renewal RFP",
      targetSecondaryLabel: "Knowledge source",
      targetSecondaryPlaceholder: "Questionnaire, pricing notes, prior answers",
      goalPlaceholder: "Describe the bid objective, decision criteria, deadlines, and what the response must prove.",
      attachmentNameDefault: "rfp-brief.md",
      attachmentContentPlaceholder: "Paste the RFP brief, buyer questions, win themes, or evaluation rules",
      idleHint: "Approvals mark the response pack as ready for client review. No GitHub write step is required.",
      reviewerHint: "The team pauses before releasing any client-ready proposal packet.",
      accentText: "text-amber-200/90",
      accentBorder: "border-amber-300/30",
      selectedCard: "border-amber-300/50 bg-amber-400/10 shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_18px_50px_rgba(180,83,9,0.22)]",
      idleCard: "border-white/10 bg-white/[0.03] hover:border-amber-300/20 hover:bg-amber-400/[0.05]",
      tintPanel: "border-amber-300/20 bg-[linear-gradient(180deg,rgba(39,24,11,0.95),rgba(11,8,6,0.88))]",
      button: "bg-amber-300 text-stone-950 hover:bg-amber-200"
    },
    {
      id: "social_media_ops",
      stage: "coming_soon",
      name: "Social Media Ops",
      eyebrow: "Coming soon",
      description: "Campaign planning, channel copy, brand review, and publish-ready approval packs for agency teams.",
      targetPrimaryLabel: "Brand account",
      targetPrimaryPlaceholder: "Brand account",
      targetSecondaryLabel: "Channel mix",
      targetSecondaryPlaceholder: "Channel mix",
      goalPlaceholder: "Goal",
      attachmentNameDefault: "brief.md",
      attachmentContentPlaceholder: "Brief",
      idleHint: "",
      reviewerHint: "",
      accentText: "text-pink-200/90",
      accentBorder: "border-pink-300/30",
      selectedCard: "",
      idleCard: "border-white/10 bg-white/[0.03]",
      tintPanel: "",
      button: "bg-pink-300 text-slate-950 hover:bg-pink-200"
    },
    {
      id: "security_questionnaire",
      stage: "coming_soon",
      name: "Security Questionnaire Team",
      eyebrow: "Coming soon",
      description: "Vendor-security questionnaire drafting, evidence gathering, redline review, and approval gating.",
      targetPrimaryLabel: "Vendor profile",
      targetPrimaryPlaceholder: "Vendor profile",
      targetSecondaryLabel: "Evidence set",
      targetSecondaryPlaceholder: "Evidence set",
      goalPlaceholder: "Goal",
      attachmentNameDefault: "brief.md",
      attachmentContentPlaceholder: "Brief",
      idleHint: "",
      reviewerHint: "",
      accentText: "text-emerald-200/90",
      accentBorder: "border-emerald-300/30",
      selectedCard: "",
      idleCard: "border-white/10 bg-white/[0.03]",
      tintPanel: "",
      button: "bg-emerald-300 text-slate-950 hover:bg-emerald-200"
    }
  ],
  tr: [
    {
      id: "software_delivery",
      stage: "active",
      name: "Yazılım Teslim Ekibi",
      eyebrow: "Mühendislik akışı",
      description: "Yazılım teslimi, kod inceleme ve GitHub onay kapısı için repo farkındalıklı AI ekip şablonu.",
      targetPrimaryLabel: "Hedef depo",
      targetPrimaryPlaceholder: "owner/repo",
      targetSecondaryLabel: "Hedef branch",
      targetSecondaryPlaceholder: "main",
      goalPlaceholder: "Mühendislik çıktısını, etkilenen sistemleri ve değişikliğin neden önemli olduğunu yaz.",
      attachmentNameDefault: "brief.md",
      attachmentContentPlaceholder: "Issue notları, loglar, kabul kriterleri veya mimari bağlam",
      idleHint: "Yazılım akışında onay sonrası yalnızca draft PR açılır.",
      reviewerHint: "Operatör onayı gelmeden GitHub yazma adımı açılmaz.",
      accentText: "text-cyan-200/80",
      accentBorder: "border-cyan-300/30",
      selectedCard: "border-cyan-300/50 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_18px_50px_rgba(14,116,144,0.22)]",
      idleCard: "border-white/10 bg-white/[0.03] hover:border-cyan-300/20 hover:bg-cyan-400/[0.05]",
      tintPanel: "border-cyan-300/20 bg-[linear-gradient(180deg,rgba(10,25,36,0.95),rgba(5,11,16,0.88))]",
      button: "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
    },
    {
      id: "rfp_response",
      stage: "active",
      name: "RFP Yanıt Ekibi",
      eyebrow: "Teklif akışı",
      description: "Capture planı, yanıt taslağı, red-team incelemesi ve final onay paketi için hazır AI ekip şablonu.",
      targetPrimaryLabel: "Hesap veya fırsat",
      targetPrimaryPlaceholder: "Acme Corp yenileme RFP",
      targetSecondaryLabel: "Bilgi kaynağı",
      targetSecondaryPlaceholder: "Soru seti, fiyat notları, önceki yanıtlar",
      goalPlaceholder: "Teklif hedefini, karar kriterlerini, teslim tarihlerini ve yanıtın neyi kanıtlaması gerektiğini yaz.",
      attachmentNameDefault: "rfp-brief.md",
      attachmentContentPlaceholder: "RFP özeti, alıcı soruları, kazanma temaları veya değerlendirme kurallarını ekle",
      idleHint: "Onay sonrası istemciye hazır teklif paketi tamamlandı olarak işaretlenir. GitHub yazma adımı yoktur.",
      reviewerHint: "Takım, müşteriye gidecek paket açılmadan önce insan onayında durur.",
      accentText: "text-amber-200/90",
      accentBorder: "border-amber-300/30",
      selectedCard: "border-amber-300/50 bg-amber-400/10 shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_18px_50px_rgba(180,83,9,0.22)]",
      idleCard: "border-white/10 bg-white/[0.03] hover:border-amber-300/20 hover:bg-amber-400/[0.05]",
      tintPanel: "border-amber-300/20 bg-[linear-gradient(180deg,rgba(39,24,11,0.95),rgba(11,8,6,0.88))]",
      button: "bg-amber-300 text-stone-950 hover:bg-amber-200"
    },
    {
      id: "social_media_ops",
      stage: "coming_soon",
      name: "Sosyal Medya Operasyonları",
      eyebrow: "Yakında",
      description: "Ajans ekipleri için kampanya planı, kanal metni, marka incelemesi ve yayın onay paketleri.",
      targetPrimaryLabel: "Marka hesabı",
      targetPrimaryPlaceholder: "Marka hesabı",
      targetSecondaryLabel: "Kanal seti",
      targetSecondaryPlaceholder: "Kanal seti",
      goalPlaceholder: "Hedef",
      attachmentNameDefault: "brief.md",
      attachmentContentPlaceholder: "Brief",
      idleHint: "",
      reviewerHint: "",
      accentText: "text-pink-200/90",
      accentBorder: "border-pink-300/30",
      selectedCard: "",
      idleCard: "border-white/10 bg-white/[0.03]",
      tintPanel: "",
      button: "bg-pink-300 text-slate-950 hover:bg-pink-200"
    },
    {
      id: "security_questionnaire",
      stage: "coming_soon",
      name: "Güvenlik Soru Formu Ekibi",
      eyebrow: "Yakında",
      description: "Tedarikçi güvenlik soru formları, kanıt toplama, redline incelemesi ve onay kapısı için ekip şablonu.",
      targetPrimaryLabel: "Tedarikçi profili",
      targetPrimaryPlaceholder: "Tedarikçi profili",
      targetSecondaryLabel: "Kanıt seti",
      targetSecondaryPlaceholder: "Kanıt seti",
      goalPlaceholder: "Hedef",
      attachmentNameDefault: "brief.md",
      attachmentContentPlaceholder: "Brief",
      idleHint: "",
      reviewerHint: "",
      accentText: "text-emerald-200/90",
      accentBorder: "border-emerald-300/30",
      selectedCard: "",
      idleCard: "border-white/10 bg-white/[0.03]",
      tintPanel: "",
      button: "bg-emerald-300 text-slate-950 hover:bg-emerald-200"
    }
  ]
};

export function listWorkflowPresentations(locale: Locale) {
  return catalog[locale];
}

export function getWorkflowPresentation(template: WorkflowTemplateId, locale: Locale) {
  return catalog[locale].find((item) => item.id === template) ?? catalog[locale][0]!;
}

