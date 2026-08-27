import { entityId } from "@/features/organization/types";
import type {
  CatalogScope,
  MissionTemplate,
  MissionTemplateInput,
  TemplateColumn,
  TemplateHeaderGroup,
  TemplateVisibilityScope,
  TemplateWorkflowRules,
} from "./types";
import { resolveTemplateWorkflowRules } from "./types";

export type TemplateDraft = {
  id: string;
  name: string;
  code: string;
  columns: TemplateColumn[];
  headerGroups: TemplateHeaderGroup[];
  includedContentIds: string[];
  workflowRules: TemplateWorkflowRules;
  progressWeight: string;
  qualityWeight: string;
  visibilityScope: TemplateVisibilityScope;
  assignedRoleIds: string[];
  assignedUserIds: string[];
  isActive: boolean;
  scope?: CatalogScope;
  ownerDepartmentId?: string | null;
};

function cloneHeaderGroups(
  groups: TemplateHeaderGroup[],
): TemplateHeaderGroup[] {
  return groups.map((group) => ({
    ...group,
    children: cloneHeaderGroups(group.children),
  }));
}

function serializeTemplateColumn(
  item: TemplateColumn & { sourceField?: unknown },
): TemplateColumn {
  return {
    id: item.id,
    key: item.key,
    title: item.title,
    headerPath: [...item.headerPath],
    width: item.width,
    visible: item.visible,
    inputRoleCode: item.inputRoleCode,
    dataType: item.dataType,
    required: item.required ?? false,
  };
}

export function toTemplateDraft(template: MissionTemplate): TemplateDraft {
  return {
    id: entityId(template),
    name: template.name,
    code: template.code,
    columns: template.columns.map(serializeTemplateColumn),
    headerGroups: cloneHeaderGroups(template.headerGroups),
    includedContentIds: template.includedContentIds.map(String),
    workflowRules: resolveTemplateWorkflowRules(template.workflowRules),
    progressWeight: String(template.progressWeight),
    qualityWeight: String(template.qualityWeight),
    visibilityScope: template.visibilityScope,
    assignedRoleIds: template.assignedRoleIds.map(String),
    assignedUserIds: template.assignedUserIds.map(String),
    isActive: template.isActive,
    scope: template.scope,
    ownerDepartmentId: template.ownerDepartmentId
      ? String(
          typeof template.ownerDepartmentId === "object"
            ? entityId(template.ownerDepartmentId)
            : template.ownerDepartmentId,
        )
      : null,
  };
}

export function toTemplateInput(template: TemplateDraft): MissionTemplateInput {
  return {
    name: template.name.trim(),
    code: template.code.trim().toUpperCase(),
    columns: template.columns.map(serializeTemplateColumn),
    headerGroups: template.headerGroups,
    includedContentIds: template.includedContentIds,
    workflowRules: resolveTemplateWorkflowRules(template.workflowRules),
    progressWeight: Number(template.progressWeight) || 0,
    qualityWeight: Number(template.qualityWeight) || 0,
    visibilityScope: template.visibilityScope,
    assignedRoleIds: template.assignedRoleIds,
    assignedUserIds: template.assignedUserIds,
    isActive: template.isActive,
    ...(template.scope ? { scope: template.scope } : {}),
    ...(template.ownerDepartmentId
      ? { ownerDepartmentId: template.ownerDepartmentId }
      : {}),
  };
}

export function createBlankTemplateDraft(
  name: string,
  code: string,
  includedContentIds: string[] = [],
  scope: CatalogScope = "SYSTEM",
  ownerDepartmentId: string | null = null,
): TemplateDraft {
  return {
    id: "",
    name,
    code,
    columns: [],
    headerGroups: [],
    includedContentIds,
    workflowRules: resolveTemplateWorkflowRules(),
    progressWeight: "50",
    qualityWeight: "50",
    visibilityScope: "ALL",
    assignedRoleIds: [],
    assignedUserIds: [],
    isActive: true,
    scope,
    ownerDepartmentId,
  };
}
