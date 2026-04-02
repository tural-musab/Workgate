import type { AgentRole, TaskRequest, WorkflowTemplateId } from "@workgate/shared";

function workflowLabel(template: WorkflowTemplateId) {
  switch (template) {
    case "rfp_response":
      return "RFP Response Team";
    case "social_media_ops":
      return "Social Media Ops";
    case "security_questionnaire":
      return "Security Questionnaire Team";
    default:
      return "Software Delivery Team";
  }
}

function targetLabels(template: WorkflowTemplateId) {
  if (template === "rfp_response") {
    return {
      primary: "Account / opportunity",
      secondary: "Knowledge source"
    };
  }

  return {
    primary: "Target repo",
    secondary: "Target branch"
  };
}

export function buildRoleSystemPrompt(role: AgentRole, template: WorkflowTemplateId) {
  const softwarePrompts: Record<AgentRole, string> = {
    router: "You are the routing layer for a controlled software delivery workflow. Classify work, identify risk, and keep the output concise and operational.",
    coordinator: "You are the chief of staff for a software delivery team. Turn a request into an execution brief with dependencies, acceptance criteria, and escalation notes.",
    research: "You are a software-context research analyst. Gather context from the task input and produce evidence-minded notes without inventing unsupported facts.",
    pm: "You are an AI product manager. Produce a scoped delivery brief, clarify out-of-scope boundaries, and tighten acceptance criteria.",
    architect: "You are a software architect. Produce a practical architecture memo with trade-offs, risks, and implementation edges.",
    engineer: "You are a software engineer. Produce the minimum safe change plan, a patch summary, and the validation approach.",
    reviewer: "You are a skeptical software reviewer. Focus on flaws, regressions, missing tests, and weak assumptions.",
    docs: "You are a technical documentation agent. Produce clear, operational engineering documents with no marketing language."
  };

  const rfpPrompts: Record<AgentRole, string> = {
    router: "You are the routing layer for a proposal response workflow. Classify work, identify approval risk, and keep the output concise and operational.",
    coordinator: "You are the bid coordinator for an RFP response team. Turn a request into an execution brief with dependencies, evidence needs, and approval notes.",
    research: "You are a capture and buyer-context analyst. Gather context from the task input and produce evidence-minded notes without inventing unsupported facts.",
    pm: "You are a proposal strategist. Produce a scoped response brief, clarify out-of-scope boundaries, and tighten acceptance criteria.",
    architect: "You are a solution-positioning architect. Produce a practical strategy memo with trade-offs, proof points, and delivery risks.",
    engineer: "You are the proposal drafter for the selected workflow. Produce the main response package, key claims, and the validation approach.",
    reviewer: "You are a skeptical red-team reviewer. Focus on unsupported claims, compliance gaps, weak proof, and approval risks.",
    docs: "You are a proposal packaging agent. Produce clear, operational final documents with no marketing fluff."
  };

  const prompts = template === "rfp_response" ? rfpPrompts : softwarePrompts;

  return `${prompts[role]}\n\nRespond using this exact structure:
<summary>One short paragraph.</summary>
<deliverable>Markdown body.</deliverable>
<risks>
- risk or 'None'
</risks>
<needs_human>true|false</needs_human>`;
}

export function buildRoleUserPrompt(role: AgentRole, task: TaskRequest, context: string) {
  const labels = targetLabels(task.workflowTemplate);
  return `Workflow template: ${workflowLabel(task.workflowTemplate)}
Task title: ${task.title}
Task type: ${task.taskType}
${labels.primary}: ${task.targetRepo}
${labels.secondary}: ${task.targetBranch}

Goal:
${task.goal}

Constraints:
${task.constraints.length > 0 ? task.constraints.map((item) => `- ${item}`).join("\n") : "- None provided"}

Acceptance criteria:
${task.acceptanceCriteria.length > 0 ? task.acceptanceCriteria.map((item) => `- ${item}`).join("\n") : "- None provided"}

Attachments:
${task.attachments.length > 0 ? task.attachments.map((item) => `## ${item.name}\n${item.content}`).join("\n\n") : "None"}

Workflow context for ${role}:
${context}`;
}
