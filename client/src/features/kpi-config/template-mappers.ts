import { entityId } from "@/features/organization/types";
import type {
  KpiTemplate,
  KpiTemplateInput,
  TemplateColumn,
  TemplateHeaderGroup,
  TemplateVisibilityScope,
} from "./types";

export type TemplateDraft = {
  id: string;
  name: string;
  code: string;
  columns: TemplateColumn[];
  headerGroups: TemplateHeaderGroup[];
  includedContentIds: string[];
  progressWeight: string;
  qualityWeight: string;
  visibilityScope: TemplateVisibilityScope;
  assignedRoleIds: string[];
  assignedUserIds: string[];
  isActive: boolean;
};

function cloneHeaderGroups(groups: TemplateHeaderGroup[]): TemplateHeaderGroup[] {
  return groups.map((group) => ({
    ...group,
    children: cloneHeaderGroups(group.children),
  }));
}

export function toTemplateDraft(template: KpiTemplate): TemplateDraft {
  return {
    id: entityId(template),
    name: template.name,
    code: template.code,
    columns: template.columns.map((item) => ({
      ...item,
      headerPath: [...item.headerPath],
    })),
    headerGroups: cloneHeaderGroups(template.headerGroups),
    includedContentIds: template.includedContentIds.map(String),
    progressWeight: String(template.progressWeight),
    qualityWeight: String(template.qualityWeight),
    visibilityScope: template.visibilityScope,
    assignedRoleIds: template.assignedRoleIds.map(String),
    assignedUserIds: template.assignedUserIds.map(String),
    isActive: template.isActive,
  };
}

export function toTemplateInput(template: TemplateDraft): KpiTemplateInput {
  return {
    name: template.name.trim(),
    code: template.code.trim().toUpperCase(),
    columns: template.columns,
    headerGroups: template.headerGroups,
    includedContentIds: template.includedContentIds,
    progressWeight: Number(template.progressWeight) || 0,
    qualityWeight: Number(template.qualityWeight) || 0,
    visibilityScope: template.visibilityScope,
    assignedRoleIds: template.assignedRoleIds,
    assignedUserIds: template.assignedUserIds,
    isActive: template.isActive,
  };
}

export function createBlankTemplateDraft(
  name: string,
  code: string,
  includedContentIds: string[] = [],
): TemplateDraft {
  return {
    id: "",
    name,
    code,
    columns: [],
    headerGroups: [],
    includedContentIds,
    progressWeight: "50",
    qualityWeight: "50",
    visibilityScope: "ALL",
    assignedRoleIds: [],
    assignedUserIds: [],
    isActive: true,
  };
}
