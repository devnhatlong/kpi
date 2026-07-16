import { Controller } from '@nestjs/common';
import { DepartmentLevelsService } from './department-levels.service';

@Controller('department-levels')
export class DepartmentLevelsController {
  constructor(private readonly departmentLevelsService: DepartmentLevelsService) {}
}
