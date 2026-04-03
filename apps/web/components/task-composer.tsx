"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Bot, BriefcaseBusiness, Code2, LibraryBig, Lock, Search } from "lucide-react";

import { resolveApiMessage } from "@/lib/i18n";
import { getWorkflowPresentation, listWorkflowPresentations } from "@/lib/workflows";
import { type KnowledgeSource, type TaskType, type WorkflowTemplateId } from "@workgate/shared";

import { useLocale } from "./locale-provider";

const defaultsByWorkflow: Record<WorkflowTemplateId, { taskType: TaskType; targetBranch: string; attachmentName: string }> = {
  software_delivery: {
    taskType: "bugfix",
    targetBranch: "main",
    attachmentName: "brief.md"
  },
  rfp_response: {
    taskType: "research",
    targetBranch: "",
    attachmentName: "rfp-brief.md"
  },
  social_media_ops: {
    taskType: "ops",
    targetBranch: "",
    attachmentName: "campaign-brief.md"
  },
  security_questionnaire: {
    taskType: "research",
    targetBranch: "",
    attachmentName: "security-brief.md"
  }
};

const initialState = {
  workflowTemplate: "software_delivery" as WorkflowTemplateId,
  title: "",
  goal: "",
  taskType: "bugfix" as TaskType,
  targetRepo: "",
  targetBranch: "main",
  knowledgeSourceId: "",
  knowledgeContextNote: "",
  constraints: "",
  acceptanceCriteria: "",
  attachmentName: "",
  attachmentContent: ""
};

function buildWorkflowInput(
  form: typeof initialState,
  selectedKnowledgeSource: KnowledgeSource | null
) {
  switch (form.workflowTemplate) {
    case "rfp_response":
      return {
        accountName: form.targetRepo,
        knowledgeSource: selectedKnowledgeSource
          ? [selectedKnowledgeSource.name, form.knowledgeContextNote.trim()].filter(Boolean).join(" — ")
          : form.knowledgeContextNote.trim(),
        knowledgeSourceId: selectedKnowledgeSource?.id
      };
    case "social_media_ops":
      return {
        brandAccount: form.targetRepo,
        channelMix: form.targetBranch
      };
    case "security_questionnaire":
      return {
        vendorProfile: form.targetRepo,
        evidenceSet: form.targetBranch
      };
    case "software_delivery":
    default:
      return {
        repository: form.targetRepo,
        branch: form.targetBranch
      };
  }
}

function iconForWorkflow(template: WorkflowTemplateId) {
  switch (template) {
    case "rfp_response":
      return BriefcaseBusiness;
    case "software_delivery":
      return Code2;
    default:
      return Bot;
  }
}

export function TaskComposer({ activeTeamId, knowledgeSources }: { activeTeamId: string; knowledgeSources: KnowledgeSource[] }) {
  const router = useRouter();
  const { locale, messages } = useLocale();
  const templates = listWorkflowPresentations(locale);
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedTemplate = getWorkflowPresentation(form.workflowTemplate, locale);
  const activeKnowledgeSources = useMemo(
    () => knowledgeSources.filter((source) => source.teamId === activeTeamId && source.ingestionStatus === "ready"),
    [activeTeamId, knowledgeSources]
  );
  const filteredKnowledgeSources = useMemo(() => {
    const query = knowledgeSearch.trim().toLowerCase();
    if (!query) return activeKnowledgeSources;
    return activeKnowledgeSources.filter((source) =>
      [source.name, source.description ?? "", source.originalFilename ?? ""].some((value) => value.toLowerCase().includes(query))
    );
  }, [activeKnowledgeSources, knowledgeSearch]);
  const selectedKnowledgeSource =
    form.workflowTemplate === "rfp_response"
      ? activeKnowledgeSources.find((source) => source.id === form.knowledgeSourceId) ?? null
      : null;

  function updateField(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function selectTemplate(templateId: WorkflowTemplateId) {
    const selected = getWorkflowPresentation(templateId, locale);
    if (selected.stage !== "active") {
      return;
    }

    setForm((current) => ({
      ...current,
      workflowTemplate: templateId,
      taskType: defaultsByWorkflow[templateId].taskType,
      targetBranch: current.workflowTemplate === templateId ? current.targetBranch : defaultsByWorkflow[templateId].targetBranch,
      attachmentName: current.workflowTemplate === templateId ? current.attachmentName : defaultsByWorkflow[templateId].attachmentName,
      knowledgeSourceId: templateId === "rfp_response" ? current.knowledgeSourceId : "",
      knowledgeContextNote: templateId === "rfp_response" ? current.knowledgeContextNote : ""
    }));
  }

  useEffect(() => {
    setForm((current) => ({
      ...current,
      attachmentName: current.attachmentName || selectedTemplate.attachmentNameDefault
    }));
  }, [selectedTemplate.attachmentNameDefault]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (form.workflowTemplate === "rfp_response" && !selectedKnowledgeSource) {
      setError(locale === "tr" ? "RFP akışı için hazır bir knowledge pack seçmelisin." : "Select a ready knowledge pack before starting an RFP run.");
      return;
    }

    const payload = {
      teamId: activeTeamId,
      title: form.title,
      goal: form.goal,
      taskType: form.taskType,
      workflowTemplate: form.workflowTemplate,
      workflowInput: buildWorkflowInput(form, selectedKnowledgeSource),
      constraints: form.constraints
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      acceptanceCriteria: form.acceptanceCriteria
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      attachments: form.attachmentContent
        ? [
            {
              name: form.attachmentName || selectedTemplate.attachmentNameDefault,
              type: "markdown",
              content: form.attachmentContent
            }
          ]
        : []
    };

    startTransition(async () => {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(resolveApiMessage(body?.error, messages, "unableToStartRun"));
        return;
      }

      const body = (await response.json()) as { runId: string };
      router.push(`/runs/${body.runId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 rounded-[2rem] border px-6 py-6 ${selectedTemplate.tintPanel}`}>
      <div className="space-y-2">
        <div className={`text-[0.72rem] uppercase tracking-[0.2em] ${selectedTemplate.accentText}`}>{messages.taskComposer.eyebrow}</div>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{messages.taskComposer.title}</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-300">{messages.taskComposer.description}</p>
      </div>

      <section className="space-y-4 rounded-[1.75rem] border border-white/10 bg-black/20 px-5 py-5">
        <div className="space-y-1">
          <div className={`text-[0.72rem] uppercase tracking-[0.18em] ${selectedTemplate.accentText}`}>{messages.taskComposer.workflowEyebrow}</div>
          <h3 className="text-xl font-semibold tracking-[-0.04em] text-white">{messages.taskComposer.workflowTitle}</h3>
          <p className="max-w-3xl text-sm leading-6 text-slate-400">{messages.taskComposer.workflowDescription}</p>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {templates.map((template) => {
            const Icon = iconForWorkflow(template.id);
            const selected = template.id === form.workflowTemplate;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template.id)}
                disabled={template.stage !== "active"}
                className={[
                  "rounded-[1.5rem] border px-4 py-4 text-left transition",
                  template.stage === "active" ? (selected ? template.selectedCard : template.idleCard) : "border-white/10 bg-white/[0.025] opacity-80",
                  template.stage !== "active" ? "cursor-not-allowed" : "cursor-pointer"
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className={`inline-flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.18em] ${template.accentText}`}>
                      <Icon className="h-4 w-4" />
                      {template.eyebrow}
                    </div>
                    <div>
                      <div className="text-lg font-medium text-white">{template.name}</div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{template.description}</p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-[0.68rem] uppercase tracking-[0.18em] ${
                      template.stage === "active" ? `${template.accentBorder} ${template.accentText}` : "border-white/10 text-slate-400"
                    }`}
                  >
                    {template.stage === "active" ? messages.taskComposer.activeNow : messages.taskComposer.comingSoon}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.9fr]">
        <label className="space-y-2">
          <span className="text-sm text-slate-300">{messages.taskComposer.titleLabel}</span>
          <input
            required
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-white/30"
            placeholder={messages.taskComposer.titlePlaceholder}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm text-slate-300">{messages.taskComposer.taskTypeLabel}</span>
          <select
            value={form.taskType}
            onChange={(event) => updateField("taskType", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none focus:border-white/30"
          >
            <option value="bugfix">{messages.taskTypes.bugfix}</option>
            <option value="feature">{messages.taskTypes.feature}</option>
            <option value="research">{messages.taskTypes.research}</option>
            <option value="ops">{messages.taskTypes.ops}</option>
          </select>
        </label>
      </div>

      <label className="space-y-2">
        <span className="text-sm text-slate-300">{messages.taskComposer.goalLabel}</span>
        <textarea
          required
          value={form.goal}
          onChange={(event) => updateField("goal", event.target.value)}
          className="min-h-36 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-white/30"
          placeholder={selectedTemplate.goalPlaceholder}
        />
      </label>

      <div className="grid gap-5 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm text-slate-300">{selectedTemplate.targetPrimaryLabel}</span>
          <input
            required
            value={form.targetRepo}
            onChange={(event) => updateField("targetRepo", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-white/30"
            placeholder={selectedTemplate.targetPrimaryPlaceholder}
          />
        </label>
        {form.workflowTemplate === "rfp_response" ? (
          <div className="space-y-3 rounded-[1.5rem] border border-amber-300/20 bg-amber-400/[0.04] px-4 py-4">
            <div className="flex items-center gap-2 text-sm text-amber-100">
              <LibraryBig className="h-4 w-4" />
              <span>{selectedTemplate.targetSecondaryLabel}</span>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-100/60" />
              <input
                value={knowledgeSearch}
                onChange={(event) => setKnowledgeSearch(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-11 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/40"
                placeholder={locale === "tr" ? "Knowledge pack ara" : "Search knowledge packs"}
              />
            </label>
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {filteredKnowledgeSources.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-4 text-sm text-slate-400">
                  {locale === "tr"
                    ? "Aktif takım için seçilebilir knowledge pack yok. Önce Settings içinden yükle veya kaydet."
                    : "No selectable knowledge packs for the active team yet. Upload or save one from Settings first."}
                </div>
              ) : (
                filteredKnowledgeSources.map((source) => {
                  const selected = source.id === form.knowledgeSourceId;
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => updateField("knowledgeSourceId", source.id)}
                      className={[
                        "w-full rounded-[1.25rem] border px-4 py-4 text-left transition",
                        selected ? "border-amber-300/45 bg-amber-300/10" : "border-white/10 bg-black/20 hover:border-amber-300/25 hover:bg-white/[0.03]"
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">{source.name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-amber-100/70">
                            {source.sourceType}
                            {source.originalFilename ? ` · ${source.originalFilename}` : ""}
                          </div>
                        </div>
                        <span className="rounded-full border border-amber-300/25 px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-amber-100/80">
                          {locale === "tr" ? "Hazır" : "Ready"}
                        </span>
                      </div>
                      {source.description ? <p className="mt-2 text-sm leading-6 text-slate-300">{source.description}</p> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <label className="space-y-2">
            <span className="text-sm text-slate-300">{selectedTemplate.targetSecondaryLabel}</span>
            <input
              required
              value={form.targetBranch}
              onChange={(event) => updateField("targetBranch", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-white/30"
              placeholder={selectedTemplate.targetSecondaryPlaceholder}
            />
          </label>
        )}
      </div>

      {form.workflowTemplate === "rfp_response" ? (
        <label className="space-y-2">
          <span className="text-sm text-slate-300">{locale === "tr" ? "Ek bağlam notu" : "Optional context note"}</span>
          <textarea
            value={form.knowledgeContextNote}
            onChange={(event) => updateField("knowledgeContextNote", event.target.value)}
            className="min-h-28 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-amber-300/35"
            placeholder={
              locale === "tr"
                ? "Seçilen knowledge pack’e eklenecek kısa fırsat notu, teslim tarihi veya kazanma vurgusu."
                : "Optional short note to attach to the selected knowledge pack, such as deadline, buyer emphasis, or win theme."
            }
          />
        </label>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm text-slate-300">{messages.taskComposer.constraintsLabel}</span>
          <textarea
            value={form.constraints}
            onChange={(event) => updateField("constraints", event.target.value)}
            className="min-h-32 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-white/30"
            placeholder={messages.taskComposer.constraintsPlaceholder}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm text-slate-300">{messages.taskComposer.acceptanceCriteriaLabel}</span>
          <textarea
            value={form.acceptanceCriteria}
            onChange={(event) => updateField("acceptanceCriteria", event.target.value)}
            className="min-h-32 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-white/30"
            placeholder={messages.taskComposer.acceptanceCriteriaPlaceholder}
          />
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.7fr_1.3fr]">
        <label className="space-y-2">
          <span className="text-sm text-slate-300">{messages.taskComposer.attachmentNameLabel}</span>
          <input
            value={form.attachmentName}
            onChange={(event) => updateField("attachmentName", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-white/30"
            placeholder={selectedTemplate.attachmentNameDefault}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm text-slate-300">{messages.taskComposer.attachmentContentLabel}</span>
          <textarea
            value={form.attachmentContent}
            onChange={(event) => updateField("attachmentContent", event.target.value)}
            className="min-h-28 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-white/30"
            placeholder={selectedTemplate.attachmentContentPlaceholder}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 text-sm text-slate-400">
          <div className={selectedTemplate.accentText}>{selectedTemplate.reviewerHint}</div>
          <div>{error ? <span className="text-rose-300">{error}</span> : selectedTemplate.idleHint || messages.taskComposer.idleHint}</div>
        </div>
        <button type="submit" disabled={isPending} className={`rounded-full px-5 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${selectedTemplate.button}`}>
          {isPending ? messages.taskComposer.pending : messages.taskComposer.submit}
        </button>
      </div>

      {selectedTemplate.stage !== "active" ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-400">
          <Lock className="h-3.5 w-3.5" />
          {messages.taskComposer.comingSoon}
        </div>
      ) : null}
    </form>
  );
}
