import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '@/modules/roles/schemas/role.schema';
import { SaveMissionScopeConfigDto } from './dto/mission-scope-config.dto';
import {
  MISSION_SCOPE_META,
  MISSION_SCOPE_SEEDS,
  defaultSeedFor,
  type MissionScope,
} from './mission-scope.constants';
import {
  MissionScopeConfig,
  MissionScopeConfigDocument,
} from './schemas/mission-scope-config.schema';

/** Phạm vi hiệu lực của một người, gộp từ mọi vai trò họ đang giữ. */
export type EffectiveScope = {
  isEnabled: boolean;
  scopes: Set<MissionScope>;
  requireApproval: boolean;
};

@Injectable()
export class MissionScopeConfigService implements OnModuleInit {
  constructor(
    @InjectModel(MissionScopeConfig.name)
    private readonly configModel: Model<MissionScopeConfigDocument>,
    @InjectModel(Role.name)
    private readonly roleModel: Model<RoleDocument>,
  ) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

  /** Tạo bản ghi cho vai trò chưa có cấu hình, không đụng bản ghi đã có. */
  private async seedDefaults() {
    for (const seed of MISSION_SCOPE_SEEDS) {
      await this.configModel.updateOne(
        { roleCode: seed.roleCode },
        { $setOnInsert: seed },
        { upsert: true },
      );
    }
  }

  async findAll() {
    const [roles, configs] = await Promise.all([
      this.roleModel.find({ isActive: true }).sort({ sortOrder: 1, code: 1 }),
      this.configModel.find(),
    ]);

    const byRole = new Map(
      configs.map((item) => [item.roleCode, item] as const),
    );

    // Vai trò mới tạo sau khi seed vẫn hiện ra, dùng mặc định cho tới khi lưu.
    const items = roles.map((role) => {
      const config = byRole.get(role.code);
      const fallback = defaultSeedFor(role.code);
      return {
        roleCode: role.code,
        roleName: role.name,
        sortOrder: role.sortOrder ?? 0,
        isEnabled: config?.isEnabled ?? fallback.isEnabled,
        scopes: config?.scopes ?? fallback.scopes,
        requireApproval: config?.requireApproval ?? fallback.requireApproval,
        note: config?.note ?? fallback.note,
      };
    });

    return { data: { items, scopeMeta: MISSION_SCOPE_META } };
  }

  async save(dto: SaveMissionScopeConfigDto) {
    for (const item of dto.items) {
      const roleCode = item.roleCode.trim().toUpperCase();
      await this.configModel.updateOne(
        { roleCode },
        {
          $set: {
            isEnabled: item.isEnabled ?? false,
            scopes: [...new Set(item.scopes)],
            requireApproval: item.requireApproval ?? true,
            note: item.note?.trim() ?? '',
          },
        },
        { upsert: true },
      );
    }
    return { message: 'Đã lưu cấu hình phạm vi giao nhiệm vụ.' };
  }

  /** Khôi phục toàn bộ về mặc định hệ thống. */
  async resetToDefault() {
    for (const seed of MISSION_SCOPE_SEEDS) {
      await this.configModel.updateOne(
        { roleCode: seed.roleCode },
        { $set: seed },
        { upsert: true },
      );
    }
    await this.configModel.deleteMany({
      roleCode: { $nin: MISSION_SCOPE_SEEDS.map((item) => item.roleCode) },
    });
    return this.findAll();
  }

  /**
   * Gộp phạm vi của mọi vai trò một người đang giữ.
   * Giữ nhiều vai trò thì được quyền rộng nhất trong số đó.
   */
  async getEffectiveScope(roleCodes: string[]): Promise<EffectiveScope> {
    const result: EffectiveScope = {
      isEnabled: false,
      scopes: new Set<MissionScope>(),
      requireApproval: true,
    };
    if (!roleCodes.length) return result;

    const configs = await this.configModel.find({
      roleCode: { $in: roleCodes.map((code) => code.toUpperCase()) },
    });

    const found = new Set(configs.map((item) => item.roleCode));
    const effective = [
      ...configs.map((item) => ({
        isEnabled: item.isEnabled,
        scopes: item.scopes,
        requireApproval: item.requireApproval,
      })),
      // Vai trò chưa lưu cấu hình -> dùng mặc định của nó.
      ...roleCodes
        .filter((code) => !found.has(code.toUpperCase()))
        .map((code) => defaultSeedFor(code.toUpperCase())),
    ];

    let anyNotRequiringApproval = false;
    for (const item of effective) {
      if (!item.isEnabled) continue;
      result.isEnabled = true;
      for (const scope of item.scopes) result.scopes.add(scope);
      if (!item.requireApproval) anyNotRequiringApproval = true;
    }
    result.requireApproval = !anyNotRequiringApproval;
    return result;
  }
}
