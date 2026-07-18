export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface ApiResponse<T> {
    success: boolean;
    message: string;
    data?: T;
    meta?: PaginationMeta;
    timestamp?: string;
    path?: string;
    responseTime?: string;
}

export type {
    JwtPayloadUser,
    JwtRoleAssignment,
} from './jwt-payload-user.interface';