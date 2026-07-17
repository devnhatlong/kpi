export interface ApiResponse<T> {
    success: boolean;
    message: string;
    data?: T;
    timestamp?: string;
    path?: string;
    responseTime?: string;
}

export type {
    JwtPayloadUser,
    JwtRoleAssignment,
} from './jwt-payload-user.interface';